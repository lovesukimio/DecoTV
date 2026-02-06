'use client';

import {
  Eye,
  Gauge,
  Layers,
  MessageSquare,
  RefreshCw,
  Shield,
  Type,
  X,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { DanmuMatchInfo, DanmuSettings } from '@/hooks/useDanmu';

// ============================================================================
// Types
// ============================================================================

interface DanmuSettingsPanelProps {
  /** 是否显示面板 */
  isOpen: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 当前设置 */
  settings: DanmuSettings;
  /** 更新设置回调 */
  onSettingsChange: (settings: Partial<DanmuSettings>) => void;
  /** 弹幕数量 */
  danmuCount?: number;
  /** 是否正在加载 */
  loading?: boolean;
  /** 重新加载回调 */
  onReload?: () => void;
  /** 匹配信息（显示弹幕来源） */
  matchInfo?: DanmuMatchInfo | null;
}

// ============================================================================
// Main Component
// ============================================================================

export const DanmuSettingsPanel = memo(function DanmuSettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  danmuCount = 0,
  loading = false,
  onReload,
  matchInfo,
}: DanmuSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [sliderFontSize, setSliderFontSize] = useState(settings.fontSize);
  const [sliderSpeed, setSliderSpeed] = useState(settings.speed);
  const [sliderOpacity, setSliderOpacity] = useState(settings.opacity);

  // 处理打开动画
  useEffect(() => {
    if (isOpen) {
      // 延迟一帧以触发动画
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // 处理设置更新
  const handleUpdate = useCallback(
    <K extends keyof DanmuSettings>(key: K, value: DanmuSettings[K]) => {
      onSettingsChange({ [key]: value });
    },
    [onSettingsChange],
  );

  // 滑块 UI 状态与底层引擎设置隔离
  useEffect(() => {
    setSliderFontSize(settings.fontSize);
    setSliderSpeed(settings.speed);
    setSliderOpacity(settings.opacity);
  }, [settings.fontSize, settings.speed, settings.opacity]);

  const commitFontSize = useCallback(() => {
    if (sliderFontSize !== settings.fontSize) {
      handleUpdate('fontSize', sliderFontSize);
    }
  }, [handleUpdate, settings.fontSize, sliderFontSize]);

  const commitSpeed = useCallback(() => {
    if (sliderSpeed !== settings.speed) {
      handleUpdate('speed', sliderSpeed);
    }
  }, [handleUpdate, settings.speed, sliderSpeed]);

  const commitOpacity = useCallback(() => {
    if (Math.abs(sliderOpacity - settings.opacity) > 0.001) {
      handleUpdate('opacity', sliderOpacity);
    }
  }, [handleUpdate, settings.opacity, sliderOpacity]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`absolute right-3 bottom-16 z-9999 w-72 bg-black/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden transition-all duration-300 ease-out ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 头部 - 精致设计 */}
      <div className='flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 backdrop-blur-md'>
        <div className='flex items-center gap-2'>
          <MessageSquare className='w-4 h-4 text-green-400' />
          <span className='font-semibold text-white text-sm tracking-wide'>
            弹幕设置
          </span>
          <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-gray-300'>
            {loading ? '...' : `${danmuCount}`}
          </span>
        </div>
        <div className='flex items-center gap-1'>
          {/* 刷新按钮 - 移到顶部 */}
          {onReload && (
            <button
              onClick={onReload}
              disabled={loading}
              className='p-1.5 hover:bg-white/10 rounded-lg transition-all duration-200 group'
              title='刷新弹幕'
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-400 transition-all duration-300 ${
                  loading
                    ? 'animate-spin text-green-400'
                    : 'group-hover:text-gray-300'
                }`}
              />
            </button>
          )}
          <button
            onClick={onClose}
            className='p-1.5 hover:bg-white/10 rounded-lg transition-all duration-200 group'
          >
            <X className='w-4 h-4 text-gray-400 transition-colors group-hover:text-white' />
          </button>
        </div>
      </div>

      {/* 内容区域 - 零滚动设计 */}
      <div className='px-4 py-3 space-y-3 overflow-hidden'>
        {/* 匹配信息标签 - 紧凑设计 */}
        {matchInfo && settings.enabled && danmuCount > 0 && (
          <div className='px-3 py-2 bg-linear-to-r from-green-500/15 to-green-600/10 border border-green-500/30 rounded-xl backdrop-blur-sm'>
            <p
              className='text-xs text-green-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis'
              title={`${matchInfo.animeTitle} - ${matchInfo.episodeTitle}`}
            >
              ✨ {matchInfo.animeTitle}
            </p>
            <p className='text-[11px] text-green-400/70 mt-0.5 truncate'>
              {matchInfo.episodeTitle}
            </p>
          </div>
        )}

        {/* 主开关 */}
        <div className='flex items-center justify-between py-1'>
          <span className='text-sm font-medium text-gray-200'>启用弹幕</span>
          <button
            onClick={() => handleUpdate('enabled', !settings.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${
              settings.enabled
                ? 'bg-linear-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/50'
                : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                settings.enabled ? 'translate-x-5.5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {settings.enabled && (
          <>
            {/* 快捷开关行 - 并排紧凑设计 */}
            <div className='grid grid-cols-2 gap-2 py-1'>
              {/* 显示开关 */}
              <div className='flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors'>
                <Eye className='w-3.5 h-3.5 text-gray-400 shrink-0' />
                <span className='text-xs text-gray-300'>显示</span>
                <button
                  onClick={() => handleUpdate('visible', !settings.visible)}
                  className={`ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${
                    settings.visible
                      ? 'bg-linear-to-r from-green-500 to-emerald-600'
                      : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                      settings.visible ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* 防重叠开关 */}
              <div className='flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors'>
                <Shield className='w-3.5 h-3.5 text-gray-400 shrink-0' />
                <span className='text-xs text-gray-300'>防重叠</span>
                <button
                  onClick={() =>
                    handleUpdate('antiOverlap', !settings.antiOverlap)
                  }
                  className={`ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${
                    settings.antiOverlap
                      ? 'bg-linear-to-r from-green-500 to-emerald-600'
                      : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                      settings.antiOverlap ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 滑块设置 - 压缩间距 */}
            <div className='space-y-2.5 py-1'>
              {/* 字号 */}
              <div className='flex items-center gap-3 py-0.5'>
                <div className='flex items-center gap-1.5 text-xs text-gray-300 w-16 shrink-0'>
                  <Type className='w-3.5 h-3.5 text-gray-400' />
                  <span>字号</span>
                </div>
                <input
                  type='range'
                  min={12}
                  max={48}
                  step={1}
                  value={sliderFontSize}
                  onChange={(e) =>
                    setSliderFontSize(parseFloat(e.target.value))
                  }
                  onMouseUp={commitFontSize}
                  onTouchEnd={commitFontSize}
                  onBlur={commitFontSize}
                  className='flex-1 h-1.5 bg-gray-700/50 rounded-full appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all'
                />
                <span className='text-xs text-gray-400 w-10 text-right font-mono'>
                  {sliderFontSize}
                </span>
              </div>

              {/* 速度 */}
              <div className='flex items-center gap-3 py-0.5'>
                <div className='flex items-center gap-1.5 text-xs text-gray-300 w-16 shrink-0'>
                  <Gauge className='w-3.5 h-3.5 text-gray-400' />
                  <span>速度</span>
                </div>
                <input
                  type='range'
                  min={1}
                  max={10}
                  step={1}
                  value={sliderSpeed}
                  onChange={(e) => setSliderSpeed(parseFloat(e.target.value))}
                  onMouseUp={commitSpeed}
                  onTouchEnd={commitSpeed}
                  onBlur={commitSpeed}
                  className='flex-1 h-1.5 bg-gray-700/50 rounded-full appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all'
                />
                <span className='text-xs text-gray-400 w-10 text-right font-mono'>
                  {sliderSpeed}
                </span>
              </div>

              {/* 透明度 */}
              <div className='flex items-center gap-3 py-0.5'>
                <div className='flex items-center gap-1.5 text-xs text-gray-300 w-16 shrink-0'>
                  <Eye className='w-3.5 h-3.5 text-gray-400' />
                  <span>透明</span>
                </div>
                <input
                  type='range'
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={sliderOpacity}
                  onChange={(e) => setSliderOpacity(parseFloat(e.target.value))}
                  onMouseUp={commitOpacity}
                  onTouchEnd={commitOpacity}
                  onBlur={commitOpacity}
                  className='flex-1 h-1.5 bg-gray-700/50 rounded-full appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all'
                />
                <span className='text-xs text-gray-400 w-10 text-right font-mono'>
                  {sliderOpacity.toFixed(1)}
                </span>
              </div>
            </div>

            {/* 弹幕类型 - 紧凑设计 */}
            <div className='py-1'>
              <div className='flex items-center gap-1.5 text-xs text-gray-300 mb-2'>
                <Layers className='w-3.5 h-3.5 text-gray-400' />
                <span>弹幕类型</span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                {[
                  { value: 0, label: '滚动' },
                  { value: 1, label: '顶部' },
                  { value: 2, label: '底部' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      const modes = settings.modes.includes(option.value)
                        ? settings.modes.length > 1
                          ? settings.modes.filter((m) => m !== option.value)
                          : settings.modes
                        : [...settings.modes, option.value];
                      handleUpdate('modes', modes);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      settings.modes.includes(option.value)
                        ? 'bg-linear-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部小三角指示器 - 移除（不再需要） */}
    </div>
  );
});

export default DanmuSettingsPanel;
