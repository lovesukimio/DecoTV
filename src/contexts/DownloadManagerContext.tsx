/* eslint-disable no-console */
'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  clearTaskSegmentsFromDB,
  deleteDownloadTaskFromDB,
  getDownloadedBytesFromDB,
  listDownloadedSegmentIndexesFromDB,
  loadDownloadTasksFromDB,
  readSegmentBlobFromDB,
  saveDownloadTaskToDB,
  saveSegmentBlobToDB,
} from '@/lib/download-idb';
import {
  createDownloadId,
  DownloadChannel,
  DownloadRequest,
  DownloadStatus,
  DownloadTask,
  ParsedM3U8Result,
  sanitizeFileName,
} from '@/lib/download-types';

import DownloadManagerModal from '@/components/DownloadManagerModal';

const MAX_SEGMENT_CONCURRENCY = 6;
const SPEED_WINDOW_MS = 5000;
const FFMPEG_POLL_INTERVAL_MS = 1200;

function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export const DOWNLOAD_MANAGER_OPEN_EVENT = 'decotv:download-manager:open';

interface DownloadRuntime {
  active: boolean;
  controllers: Set<AbortController>;
  speedSamples: Array<{ timestamp: number; bytes: number }>;
}

interface FfmpegJobPayload {
  id: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'error';
  progress: number;
  speed: string;
  downloadedBytes: number;
  error?: string;
  downloadUrl?: string | null;
}

interface ProxyFetchOptions {
  referer?: string;
  origin?: string;
  ua?: string;
  playlist?: boolean;
}

interface DownloadManagerContextValue {
  tasks: DownloadTask[];
  isManagerOpen: boolean;
  openManager: () => void;
  closeManager: () => void;
  enqueueDownload: (request: DownloadRequest) => Promise<string>;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
}

const DownloadManagerContext =
  createContext<DownloadManagerContextValue | null>(null);

function computeSpeed(runtime: DownloadRuntime, bytes: number): number {
  const now = Date.now();
  runtime.speedSamples.push({ timestamp: now, bytes });
  runtime.speedSamples = runtime.speedSamples.filter(
    (sample) => now - sample.timestamp <= SPEED_WINDOW_MS,
  );
  if (runtime.speedSamples.length === 0) return 0;
  const first = runtime.speedSamples[0];
  const elapsed = Math.max(1, now - first.timestamp);
  const totalBytes = runtime.speedSamples.reduce(
    (sum, sample) => sum + sample.bytes,
    0,
  );
  return (totalBytes * 1000) / elapsed;
}

function resolveTargetUrl(sourceUrl: string): string {
  if (typeof window === 'undefined') return sourceUrl;
  return new URL(sourceUrl, window.location.href).toString();
}

function isM3U8Url(sourceUrl: string): boolean {
  return /\.m3u8($|\?)/i.test(sourceUrl);
}

function buildProxyUrl(
  targetUrl: string,
  options: ProxyFetchOptions = {},
): string {
  const params = new URLSearchParams({
    url: targetUrl,
  });

  if (options.referer) {
    params.set('referer', options.referer);
  }
  if (options.origin) {
    params.set('origin', options.origin);
  }
  if (options.ua) {
    params.set('ua', options.ua);
  }
  if (options.playlist) {
    params.set('playlist', '1');
  }

  return `/api/download/proxy?${params.toString()}`;
}

function buildFfmpegApiUrl(jobId?: string): string {
  if (!jobId) return '/api/download/ffmpeg';
  return `/api/download/ffmpeg?id=${encodeURIComponent(jobId)}`;
}

function mapFfmpegStatusToTaskStatus(
  status: FfmpegJobPayload['status'],
): DownloadStatus {
  if (status === 'running') return 'downloading';
  if (status === 'paused') return 'paused';
  if (status === 'completed') return 'completed';
  if (status === 'error') return 'error';
  return 'queued';
}

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      details?: string;
      recommendation?: string;
    };

    if (payload.error && payload.recommendation) {
      return `${payload.error} ${payload.recommendation}`;
    }
    if (payload.error) {
      return payload.error;
    }
    if (payload.details) {
      return payload.details;
    }
  } catch {
    // fallback to plain text
  }

  const text = await response.text().catch(() => '');
  return text || fallback;
}

async function requestFfmpegAction(
  payload:
    | {
        action: 'start';
        sourceUrl: string;
        title: string;
        fileNameHint?: string;
      }
    | {
        action: 'pause' | 'resume' | 'remove';
        id: string;
      },
): Promise<FfmpegJobPayload | null> {
  const response = await fetch('/api/download/ffmpeg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorMessage = await readApiErrorMessage(
      response,
      `FFmpeg API request failed (${response.status})`,
    );
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    job?: FfmpegJobPayload;
  };

  return data.job || null;
}

async function fetchFfmpegJob(jobId: string): Promise<FfmpegJobPayload | null> {
  const response = await fetch(buildFfmpegApiUrl(jobId), {
    cache: 'no-store',
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const errorMessage = await readApiErrorMessage(
      response,
      `Failed to query FFmpeg job (${response.status})`,
    );
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    job?: FfmpegJobPayload;
  };

  return data.job || null;
}

async function fetchTextByProxy(
  targetUrl: string,
  referer?: string,
): Promise<string> {
  const response = await fetch(
    buildProxyUrl(targetUrl, {
      referer,
      playlist: true,
    }),
    {
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const details = await readApiErrorMessage(
      response,
      `拉取播放列表失败 (${response.status})`,
    );
    throw new Error(details);
  }
  return response.text();
}

function extractBandwidth(line: string): number {
  const match = line.match(/BANDWIDTH=(\d+)/i);
  if (!match) return 0;
  return Number.parseInt(match[1], 10) || 0;
}

function parseDuration(line: string): number {
  const match = line.match(/^#EXTINF:([\d.]+)/i);
  if (!match) return 0;
  return Number.parseFloat(match[1]) || 0;
}

async function parseM3U8Playlist(
  playlistUrl: string,
  depth = 0,
  referer?: string,
): Promise<ParsedM3U8Result> {
  if (depth > 4) {
    throw new Error('M3U8 嵌套层级过深');
  }

  const text = await fetchTextByProxy(playlistUrl, referer);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const variants: Array<{ url: string; bandwidth: number }> = [];
  const segmentUrls: string[] = [];
  const nestedPlaylists: string[] = [];
  let pendingBandwidth = 0;
  let waitingVariantUrl = false;
  let encrypted = false;
  let durationSeconds = 0;

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        pendingBandwidth = extractBandwidth(line);
        waitingVariantUrl = true;
      } else if (line.startsWith('#EXT-X-KEY')) {
        const method = line.match(/METHOD=([^,]+)/i)?.[1]?.toUpperCase();
        if (method && method !== 'NONE') {
          encrypted = true;
        }
      } else if (line.startsWith('#EXTINF:')) {
        durationSeconds += parseDuration(line);
      }
      continue;
    }

    const resolved = new URL(line, playlistUrl).toString();
    if (waitingVariantUrl) {
      variants.push({ url: resolved, bandwidth: pendingBandwidth });
      waitingVariantUrl = false;
      pendingBandwidth = 0;
      continue;
    }

    if (isM3U8Url(resolved)) {
      nestedPlaylists.push(resolved);
      continue;
    }

    segmentUrls.push(resolved);
  }

  if (variants.length > 0) {
    variants.sort((a, b) => b.bandwidth - a.bandwidth);
    return parseM3U8Playlist(variants[0].url, depth + 1, playlistUrl);
  }

  if (segmentUrls.length === 0 && nestedPlaylists.length > 0) {
    return parseM3U8Playlist(nestedPlaylists[0], depth + 1, playlistUrl);
  }

  return {
    playlistUrl,
    segmentUrls,
    durationSeconds,
    encrypted,
  };
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

function triggerDownloadByUrl(url: string, fileName?: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function normalizeRecoveredStatus(status: DownloadStatus): DownloadStatus {
  if (status === 'completed' || status === 'error' || status === 'paused') {
    return status;
  }
  return 'paused';
}

export function DownloadManagerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  const tasksRef = useRef<DownloadTask[]>([]);
  const runtimeMapRef = useRef<Map<string, DownloadRuntime>>(new Map());
  const ffmpegPollersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const getTaskById = useCallback((taskId: string) => {
    return tasksRef.current.find((task) => task.id === taskId) || null;
  }, []);

  const upsertTask = useCallback((task: DownloadTask) => {
    setTasks((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === task.id);
      let next: DownloadTask[];
      if (existingIndex === -1) {
        next = [task, ...prev];
      } else {
        next = [...prev];
        next[existingIndex] = task;
      }
      void saveDownloadTaskToDB(task).catch((error) => {
        console.warn('[DownloadManager] Failed to persist task:', error);
      });
      return next;
    });
  }, []);

  const patchTask = useCallback(
    (
      taskId: string,
      updater:
        | Partial<DownloadTask>
        | ((current: DownloadTask) => DownloadTask),
    ) => {
      setTasks((prev) => {
        const index = prev.findIndex((task) => task.id === taskId);
        if (index === -1) return prev;

        const current = prev[index];
        const nextTask =
          typeof updater === 'function'
            ? { ...updater(current), updatedAt: Date.now() }
            : { ...current, ...updater, updatedAt: Date.now() };

        const next = [...prev];
        next[index] = nextTask;
        void saveDownloadTaskToDB(nextTask).catch((error) => {
          console.warn(
            '[DownloadManager] Failed to persist task patch:',
            error,
          );
        });
        return next;
      });
    },
    [],
  );

  const stopFfmpegPolling = useCallback((taskId: string) => {
    const timer = ffmpegPollersRef.current.get(taskId);
    if (timer !== undefined) {
      window.clearInterval(timer);
      ffmpegPollersRef.current.delete(taskId);
    }
  }, []);

  const syncTaskWithFfmpegJob = useCallback(
    (taskId: string, job: FfmpegJobPayload) => {
      patchTask(taskId, (current) => ({
        ...current,
        ffmpegJobId: job.id,
        downloadUrl: job.downloadUrl || undefined,
        status: mapFfmpegStatusToTaskStatus(job.status),
        totalSegments: 100,
        downloadedSegments: clampProgressPercent(Math.round(job.progress)),
        mergeProgress: clampProgressPercent(job.progress),
        downloadedBytes: job.downloadedBytes,
        totalBytes: job.downloadedBytes,
        speedBps: 0,
        error: job.error,
      }));
    },
    [patchTask],
  );

  const startFfmpegPolling = useCallback(
    (taskId: string, ffmpegJobId: string) => {
      stopFfmpegPolling(taskId);
      let downloadTriggered = false;

      const poll = async () => {
        try {
          const job = await fetchFfmpegJob(ffmpegJobId);
          if (!job) {
            stopFfmpegPolling(taskId);
            patchTask(taskId, {
              status: 'error',
              speedBps: 0,
              error: 'FFmpeg 作业不存在或已失效',
            });
            return;
          }

          syncTaskWithFfmpegJob(taskId, job);

          if (job.status === 'completed' || job.status === 'error') {
            stopFfmpegPolling(taskId);
          }

          if (
            job.status === 'completed' &&
            job.downloadUrl &&
            !downloadTriggered
          ) {
            downloadTriggered = true;
            const task = getTaskById(taskId);
            triggerDownloadByUrl(job.downloadUrl, task?.fileName);
          }
        } catch (error) {
          stopFfmpegPolling(taskId);
          patchTask(taskId, {
            status: 'error',
            speedBps: 0,
            error:
              error instanceof Error ? error.message : 'FFmpeg 状态同步失败',
          });
        }
      };

      void poll();
      const timer = window.setInterval(() => {
        void poll();
      }, FFMPEG_POLL_INTERVAL_MS);
      ffmpegPollersRef.current.set(taskId, timer);
    },
    [getTaskById, patchTask, stopFfmpegPolling, syncTaskWithFfmpegJob],
  );

  const startFfmpegTask = useCallback(
    async (taskId: string, task: DownloadTask) => {
      const job = await requestFfmpegAction({
        action: 'start',
        sourceUrl: task.sourceUrl,
        title: task.title,
        fileNameHint: task.fileName.replace(/\.[^.]+$/, ''),
      });

      if (!job) {
        throw new Error('FFmpeg 转存任务启动失败');
      }

      syncTaskWithFfmpegJob(taskId, job);
      startFfmpegPolling(taskId, job.id);
    },
    [startFfmpegPolling, syncTaskWithFfmpegJob],
  );

  const stopRuntime = useCallback(
    (taskId: string) => {
      const runtime = runtimeMapRef.current.get(taskId);
      if (runtime) {
        runtime.active = false;
        runtime.controllers.forEach((controller) => controller.abort());
        runtimeMapRef.current.delete(taskId);
      }
      stopFfmpegPolling(taskId);
    },
    [stopFfmpegPolling],
  );

  const mergeM3U8Task = useCallback(
    async (taskId: string) => {
      const task = getTaskById(taskId);
      if (!task) return;

      patchTask(taskId, {
        status: 'merging',
        mergeProgress: 0,
        speedBps: 0,
      });

      const parts: Blob[] = [];
      for (let index = 0; index < task.totalSegments; index += 1) {
        const segmentBlob = await readSegmentBlobFromDB(taskId, index);
        if (!segmentBlob) {
          throw new Error(`分片 ${index + 1} 缺失，无法合并`);
        }
        parts.push(segmentBlob);

        if (index % 8 === 0 || index === task.totalSegments - 1) {
          patchTask(taskId, {
            mergeProgress: ((index + 1) / task.totalSegments) * 100,
          });
        }
      }

      const finalBlob = new Blob(parts, { type: 'video/mp2t' });
      triggerBrowserDownload(finalBlob, task.fileName);

      await clearTaskSegmentsFromDB(taskId);

      patchTask(taskId, {
        status: 'completed',
        mergeProgress: 100,
        downloadedSegments: task.totalSegments,
        totalBytes: task.downloadedBytes || finalBlob.size,
        downloadedBytes: task.downloadedBytes || finalBlob.size,
        speedBps: 0,
      });
    },
    [getTaskById, patchTask],
  );

  const runM3U8Download = useCallback(
    async (taskId: string) => {
      const task = getTaskById(taskId);
      if (!task || task.segmentUrls.length === 0) return;
      if (runtimeMapRef.current.has(taskId)) return;

      const runtime: DownloadRuntime = {
        active: true,
        controllers: new Set(),
        speedSamples: [],
      };
      runtimeMapRef.current.set(taskId, runtime);

      try {
        const downloadedIndexes = new Set(
          await listDownloadedSegmentIndexesFromDB(taskId),
        );
        let downloadedBytes = await getDownloadedBytesFromDB(taskId);
        let downloadedSegments = downloadedIndexes.size;

        patchTask(taskId, {
          status: 'downloading',
          downloadedSegments,
          downloadedBytes,
          speedBps: 0,
          error: undefined,
          totalBytes: task.totalBytes > 0 ? task.totalBytes : downloadedBytes,
        });

        const pendingIndexes: number[] = [];
        for (let index = 0; index < task.segmentUrls.length; index += 1) {
          if (!downloadedIndexes.has(index)) {
            pendingIndexes.push(index);
          }
        }

        if (pendingIndexes.length === 0) {
          await mergeM3U8Task(taskId);
          runtimeMapRef.current.delete(taskId);
          return;
        }

        const workerCount = Math.max(
          1,
          Math.min(MAX_SEGMENT_CONCURRENCY, pendingIndexes.length),
        );

        const worker = async () => {
          while (runtime.active) {
            const nextIndex = pendingIndexes.shift();
            if (nextIndex === undefined) return;

            const segmentUrl = task.segmentUrls[nextIndex];
            const controller = new AbortController();
            runtime.controllers.add(controller);
            try {
              const response = await fetch(
                buildProxyUrl(segmentUrl, {
                  referer: task.playlistUrl || task.sourceUrl,
                }),
                {
                  cache: 'no-store',
                  signal: controller.signal,
                },
              );
              if (!response.ok) {
                const details = await readApiErrorMessage(
                  response,
                  `分片下载失败 (${nextIndex + 1}/${task.totalSegments})`,
                );
                throw new Error(details);
              }
              const blob = await response.blob();
              await saveSegmentBlobToDB(taskId, nextIndex, blob);

              downloadedIndexes.add(nextIndex);
              downloadedSegments = downloadedIndexes.size;
              downloadedBytes += blob.size;
              const speedBps = computeSpeed(runtime, blob.size);

              patchTask(taskId, {
                downloadedSegments,
                downloadedBytes,
                speedBps,
                totalBytes:
                  task.totalBytes > 0
                    ? task.totalBytes
                    : Math.max(downloadedBytes, task.totalBytes),
              });
            } catch (error) {
              if (!runtime.active) return;
              if ((error as Error).name === 'AbortError') return;
              throw error;
            } finally {
              runtime.controllers.delete(controller);
            }
          }
        };

        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        if (!runtime.active) {
          patchTask(taskId, { status: 'paused', speedBps: 0 });
          runtimeMapRef.current.delete(taskId);
          return;
        }

        await mergeM3U8Task(taskId);
      } catch (error) {
        patchTask(taskId, {
          status: 'error',
          speedBps: 0,
          error:
            error instanceof Error ? error.message : '分片下载失败，请稍后重试',
        });
      } finally {
        runtimeMapRef.current.delete(taskId);
      }
    },
    [getTaskById, mergeM3U8Task, patchTask],
  );

  const runSingleFileDownload = useCallback(
    async (taskId: string, sourceUrl: string) => {
      if (runtimeMapRef.current.has(taskId)) return;
      const runtime: DownloadRuntime = {
        active: true,
        controllers: new Set(),
        speedSamples: [],
      };
      runtimeMapRef.current.set(taskId, runtime);
      const controller = new AbortController();
      runtime.controllers.add(controller);

      try {
        patchTask(taskId, {
          status: 'downloading',
          totalSegments: 1,
          speedBps: 0,
          mergeProgress: 0,
          error: undefined,
        });

        const response = await fetch(buildProxyUrl(sourceUrl), {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          const details = await readApiErrorMessage(
            response,
            `文件下载失败 (${response.status})`,
          );
          throw new Error(details);
        }

        const totalBytes = Number(response.headers.get('content-length') || 0);
        patchTask(taskId, { totalBytes });

        const chunks: ArrayBuffer[] = [];
        let loaded = 0;

        if (response.body) {
          const reader = response.body.getReader();
          while (runtime.active) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            const chunk = new Uint8Array(value);
            chunks.push(chunk.buffer);
            loaded += chunk.byteLength;
            const speedBps = computeSpeed(runtime, chunk.byteLength);
            patchTask(taskId, {
              downloadedBytes: loaded,
              downloadedSegments: loaded > 0 ? 1 : 0,
              speedBps,
              totalBytes,
            });
          }
        } else {
          const blob = await response.blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          chunks.push(bytes.buffer);
          loaded = bytes.byteLength;
          patchTask(taskId, {
            downloadedBytes: loaded,
            downloadedSegments: loaded > 0 ? 1 : 0,
            totalBytes: loaded,
          });
        }

        if (!runtime.active) {
          patchTask(taskId, { status: 'paused', speedBps: 0 });
          return;
        }

        const fileBlob = new Blob(chunks, {
          type:
            response.headers.get('content-type') || 'application/octet-stream',
        });
        const task = getTaskById(taskId);
        if (!task) return;

        triggerBrowserDownload(fileBlob, task.fileName);
        patchTask(taskId, {
          status: 'completed',
          downloadedSegments: 1,
          totalSegments: 1,
          downloadedBytes: fileBlob.size,
          totalBytes: fileBlob.size,
          speedBps: 0,
          mergeProgress: 100,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          patchTask(taskId, { status: 'paused', speedBps: 0 });
        } else {
          patchTask(taskId, {
            status: 'error',
            speedBps: 0,
            error:
              error instanceof Error
                ? error.message
                : '文件下载失败，请稍后重试',
          });
        }
      } finally {
        runtime.controllers.delete(controller);
        runtimeMapRef.current.delete(taskId);
      }
    },
    [getTaskById, patchTask],
  );

  const openManager = useCallback(() => {
    setIsManagerOpen(true);
  }, []);

  const closeManager = useCallback(() => {
    setIsManagerOpen(false);
  }, []);

  const enqueueDownload = useCallback(
    async (request: DownloadRequest): Promise<string> => {
      const sourceUrl = resolveTargetUrl(request.sourceUrl);
      const isM3U8 = isM3U8Url(sourceUrl);
      const requestedChannel: DownloadChannel =
        request.channel === 'ffmpeg' ? 'ffmpeg' : 'browser';
      const downloadChannel: DownloadChannel = isM3U8
        ? requestedChannel
        : 'browser';
      const id = createDownloadId();
      const fileNameBase = sanitizeFileName(
        request.fileNameHint || request.title || 'deco-video',
      );

      const task: DownloadTask = {
        id,
        title: request.title,
        sourceUrl,
        fileName: `${fileNameBase}${isM3U8 ? (downloadChannel === 'ffmpeg' ? '.mp4' : '.ts') : ''}`,
        mediaType: isM3U8 ? 'm3u8' : 'file',
        downloadChannel,
        status: isM3U8
          ? downloadChannel === 'ffmpeg'
            ? 'queued'
            : 'parsing'
          : 'queued',
        totalSegments: isM3U8 ? (downloadChannel === 'ffmpeg' ? 100 : 0) : 1,
        downloadedSegments: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBps: 0,
        mergeProgress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        segmentUrls: [],
      };

      upsertTask(task);
      setIsManagerOpen(true);

      if (isM3U8) {
        if (downloadChannel === 'ffmpeg') {
          try {
            await startFfmpegTask(id, task);
          } catch (error) {
            patchTask(id, {
              status: 'error',
              error:
                error instanceof Error
                  ? error.message
                  : 'FFmpeg 转存任务启动失败',
            });
          }
          return id;
        }

        try {
          const parsed = await parseM3U8Playlist(sourceUrl);
          if (parsed.encrypted) {
            patchTask(id, {
              status: 'error',
              error: '检测到加密 HLS，当前版本暂不支持自动解密合并',
            });
            return id;
          }
          if (parsed.segmentUrls.length === 0) {
            patchTask(id, {
              status: 'error',
              error: '未解析到可下载分片',
            });
            return id;
          }

          patchTask(id, (current) => ({
            ...current,
            status: 'downloading',
            playlistUrl: parsed.playlistUrl,
            segmentUrls: parsed.segmentUrls,
            totalSegments: parsed.segmentUrls.length,
            downloadedSegments: 0,
            error: undefined,
          }));

          void runM3U8Download(id);
        } catch (error) {
          patchTask(id, {
            status: 'error',
            error: error instanceof Error ? error.message : '播放列表解析失败',
          });
        }
      } else {
        void runSingleFileDownload(id, sourceUrl);
      }

      return id;
    },
    [
      patchTask,
      runM3U8Download,
      runSingleFileDownload,
      startFfmpegTask,
      upsertTask,
    ],
  );

  const pauseTask = useCallback(
    (taskId: string) => {
      const task = getTaskById(taskId);
      stopRuntime(taskId);

      if (task?.downloadChannel === 'ffmpeg' && task.ffmpegJobId) {
        void requestFfmpegAction({
          action: 'pause',
          id: task.ffmpegJobId,
        })
          .then((job) => {
            if (job) {
              syncTaskWithFfmpegJob(taskId, job);
              return;
            }
            patchTask(taskId, { status: 'paused', speedBps: 0 });
          })
          .catch((error) => {
            patchTask(taskId, {
              status: 'error',
              speedBps: 0,
              error: error instanceof Error ? error.message : 'FFmpeg 暂停失败',
            });
          });
        return;
      }

      patchTask(taskId, { status: 'paused', speedBps: 0 });
    },
    [getTaskById, patchTask, stopRuntime, syncTaskWithFfmpegJob],
  );

  const resumeTask = useCallback(
    (taskId: string) => {
      const task = getTaskById(taskId);
      if (!task) return;

      if (task.downloadChannel === 'ffmpeg') {
        patchTask(taskId, { status: 'queued', error: undefined });

        if (task.ffmpegJobId) {
          void requestFfmpegAction({
            action: 'resume',
            id: task.ffmpegJobId,
          })
            .then((job) => {
              if (!job) {
                throw new Error('FFmpeg 恢复失败，任务不存在');
              }
              syncTaskWithFfmpegJob(taskId, job);
              startFfmpegPolling(taskId, job.id);
            })
            .catch((error) => {
              patchTask(taskId, {
                status: 'error',
                speedBps: 0,
                error:
                  error instanceof Error ? error.message : 'FFmpeg 恢复失败',
              });
            });
          return;
        }

        void startFfmpegTask(taskId, task).catch((error) => {
          patchTask(taskId, {
            status: 'error',
            speedBps: 0,
            error: error instanceof Error ? error.message : 'FFmpeg 恢复失败',
          });
        });
        return;
      }

      if (runtimeMapRef.current.has(taskId)) return;

      if (task.mediaType === 'm3u8') {
        if (task.segmentUrls.length > 0) {
          patchTask(taskId, { status: 'downloading', error: undefined });
          void runM3U8Download(taskId);
          return;
        }
        patchTask(taskId, { status: 'parsing', error: undefined });
        void (async () => {
          try {
            const parsed = await parseM3U8Playlist(task.sourceUrl);
            if (parsed.encrypted) {
              patchTask(taskId, {
                status: 'error',
                error: '检测到加密 HLS，当前版本暂不支持自动解密合并',
              });
              return;
            }
            patchTask(taskId, (current) => ({
              ...current,
              playlistUrl: parsed.playlistUrl,
              segmentUrls: parsed.segmentUrls,
              totalSegments: parsed.segmentUrls.length,
              status: 'downloading',
              error: undefined,
            }));
            await runM3U8Download(taskId);
          } catch (error) {
            patchTask(taskId, {
              status: 'error',
              error:
                error instanceof Error ? error.message : '播放列表解析失败',
            });
          }
        })();
        return;
      }

      patchTask(taskId, { status: 'downloading', error: undefined });
      void runSingleFileDownload(taskId, task.sourceUrl);
    },
    [
      getTaskById,
      patchTask,
      runM3U8Download,
      runSingleFileDownload,
      startFfmpegPolling,
      startFfmpegTask,
      syncTaskWithFfmpegJob,
    ],
  );

  const retryTask = useCallback(
    (taskId: string) => {
      resumeTask(taskId);
    },
    [resumeTask],
  );

  const removeTask = useCallback(
    (taskId: string) => {
      const task = getTaskById(taskId);
      stopRuntime(taskId);

      if (task?.downloadChannel === 'ffmpeg' && task.ffmpegJobId) {
        void requestFfmpegAction({
          action: 'remove',
          id: task.ffmpegJobId,
        }).catch(() => undefined);
      }

      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      if (task?.mediaType === 'm3u8' && task.downloadChannel !== 'ffmpeg') {
        void clearTaskSegmentsFromDB(taskId).catch((error) => {
          console.warn('[DownloadManager] Failed to clear segments:', error);
        });
      }
      void deleteDownloadTaskFromDB(taskId).catch((error) => {
        console.warn('[DownloadManager] Failed to delete task:', error);
      });
    },
    [getTaskById, stopRuntime],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadDownloadTasksFromDB();
        const hydrated = await Promise.all(
          stored.map(async (task) => {
            const normalizedTask: DownloadTask = {
              ...task,
              downloadChannel: task.downloadChannel || 'browser',
            };

            if (normalizedTask.downloadChannel === 'ffmpeg') {
              return {
                ...normalizedTask,
                status: normalizeRecoveredStatus(normalizedTask.status),
                totalSegments: normalizedTask.totalSegments || 100,
                speedBps: 0,
              };
            }

            if (normalizedTask.mediaType !== 'm3u8') {
              return {
                ...normalizedTask,
                status: normalizeRecoveredStatus(normalizedTask.status),
                speedBps: 0,
              };
            }
            const [indexes, downloadedBytes] = await Promise.all([
              listDownloadedSegmentIndexesFromDB(normalizedTask.id),
              getDownloadedBytesFromDB(normalizedTask.id),
            ]);
            return {
              ...normalizedTask,
              downloadedSegments: indexes.length,
              downloadedBytes,
              totalBytes: normalizedTask.totalBytes || downloadedBytes,
              status:
                normalizedTask.status === 'completed'
                  ? 'completed'
                  : normalizeRecoveredStatus(normalizedTask.status),
              speedBps: 0,
            };
          }),
        );
        if (!cancelled) {
          setTasks(hydrated.sort((a, b) => b.updatedAt - a.updatedAt));
        }
      } catch (error) {
        console.warn('[DownloadManager] Failed to restore tasks:', error);
      }
    })();
    const runtimeMap = runtimeMapRef.current;
    const ffmpegPollers = ffmpegPollersRef.current;

    return () => {
      cancelled = true;
      runtimeMap.forEach((runtime, taskId) => {
        runtime.active = false;
        runtime.controllers.forEach((controller) => controller.abort());
        runtimeMap.delete(taskId);
      });
      ffmpegPollers.forEach((timer, taskId) => {
        window.clearInterval(timer);
        ffmpegPollers.delete(taskId);
      });
    };
  }, []);

  useEffect(() => {
    const openByEvent = () => setIsManagerOpen(true);
    window.addEventListener(DOWNLOAD_MANAGER_OPEN_EVENT, openByEvent);
    return () => {
      window.removeEventListener(DOWNLOAD_MANAGER_OPEN_EVENT, openByEvent);
    };
  }, []);

  const contextValue = useMemo<DownloadManagerContextValue>(
    () => ({
      tasks,
      isManagerOpen,
      openManager,
      closeManager,
      enqueueDownload,
      pauseTask,
      resumeTask,
      retryTask,
      removeTask,
    }),
    [
      closeManager,
      enqueueDownload,
      isManagerOpen,
      openManager,
      pauseTask,
      removeTask,
      resumeTask,
      retryTask,
      tasks,
    ],
  );

  return (
    <DownloadManagerContext.Provider value={contextValue}>
      {children}
      <DownloadManagerModal
        isOpen={isManagerOpen}
        tasks={tasks}
        onClose={closeManager}
        onPause={pauseTask}
        onResume={resumeTask}
        onRetry={retryTask}
        onRemove={removeTask}
      />
    </DownloadManagerContext.Provider>
  );
}

export function useDownloadManager() {
  const context = useContext(DownloadManagerContext);
  if (!context) {
    throw new Error(
      'useDownloadManager must be used within DownloadManagerProvider',
    );
  }
  return context;
}
