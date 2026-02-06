'use client';

import {
  Eye,
  Gauge,
  Layers,
  MessageSquare,
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
      className={`absolute right-3 bottom-16 z-50 w-72 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 overflow-hidden transition-all duration-200 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 头部 */}
      <div className='flex items-center justify-between px-3 py-2.5 border-b border-white/10 bg-white/5'>
        <div className='flex items-center gap-2'>
          <MessageSquare className='w-4 h-4 text-green-400' />
          <span className='font-medium text-white text-sm'>弹幕设置</span>
          <span className='text-xs text-gray-400'>
            {loading ? '加载中...' : `${danmuCount}条`}
          </span>
        </div>
        <button
          onClick={onClose}
          className='p-1 hover:bg-white/10 rounded transition-colors'
        >
          <X className='w-4 h-4 text-gray-400' />
        </button>
      </div>

      {/* 内容区域 */}
      <div className='p-3 space-y-3 max-h-80 overflow-y-auto'>
        {/* 匹配信息标签 */}
        {matchInfo && settings.enabled && danmuCount > 0 && (
          <div className='px-2 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg'>
            <p
              className='text-xs text-green-300 truncate'
              title={`${matchInfo.animeTitle} - ${matchInfo.episodeTitle}`}
            >
              ✨ {matchInfo.animeTitle}
            </p>
            <p className='text-[10px] text-green-400/70 truncate'>
              {matchInfo.episodeTitle}
            </p>
          </div>
        )}

        {/* 主开关 */}
        <div className='flex items-center justify-between'>
          <span className='text-sm text-gray-200'>启用弹幕</span>
          <button
            onClick={() => handleUpdate('enabled', !settings.enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              settings.enabled ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                settings.enabled ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {settings.enabled && (
          <>
            {/* 快捷开关行 */}
            <div className='flex items-center gap-4 py-2 px-2 bg-white/5 rounded-lg'>
              <div className='flex items-center gap-2 flex-1'>
                <Eye className='w-3.5 h-3.5 text-gray-400' />
                <span className='text-xs text-gray-300'>显示</span>
                <button
                  onClick={() => handleUpdate('visible', !settings.visible)}
                  className={`ml-auto relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    settings.visible ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                      settings.visible ? 'translate-x-3.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className='w-px h-4 bg-white/10' />
              <div className='flex items-center gap-2 flex-1'>
                <Shield className='w-3.5 h-3.5 text-gray-400' />
                <span className='text-xs text-gray-300'>防重叠</span>
                <button
                  onClick={() =>
                    handleUpdate('antiOverlap', !settings.antiOverlap)
                  }
                  className={`ml-auto relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    settings.antiOverlap ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                      settings.antiOverlap ? 'translate-x-3.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 滑块设置 */}
            <div className='space-y-3'>
              {/* 字号 */}
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-1.5 text-xs text-gray-300'>
                    <Type className='w-3.5 h-3.5 text-gray-400' />
                    <span>字号</span>
                  </div>
                  <span className='text-xs text-gray-400'>
                    {settings.fontSize}px
                  </span>
                </div>
                <input
                  type='range'
                  min={12}
                  max={48}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) =>
                    handleUpdate('fontSize', parseFloat(e.target.value))
                  }
                  className='w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500'
                />
              </div>

              {/* 速度 */}
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-1.5 text-xs text-gray-300'>
                    <Gauge className='w-3.5 h-3.5 text-gray-400' />
                    <span>速度</span>
                  </div>
                  <span className='text-xs text-gray-400'>
                    {settings.speed}
                  </span>
                </div>
                <input
                  type='range'
                  min={1}
                  max={10}
                  step={1}
                  value={settings.speed}
                  onChange={(e) =>
                    handleUpdate('speed', parseFloat(e.target.value))
                  }
                  className='w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500'
                />
              </div>

              {/* 透明度 */}
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-1.5 text-xs text-gray-300'>
                    <Eye className='w-3.5 h-3.5 text-gray-400' />
                    <span>透明</span>
                  </div>
                  <span className='text-xs text-gray-400'>
                    {settings.opacity.toFixed(1)}
                  </span>
                </div>
                <input
                  type='range'
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={settings.opacity}
                  onChange={(e) =>
                    handleUpdate('opacity', parseFloat(e.target.value))
                  }
                  className='w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500'
                />
              </div>
            </div>

            {/* 弹幕类型 */}
            <div className='space-y-2'>
              <div className='flex items-center gap-1.5 text-xs text-gray-300'>
                <Layers className='w-3.5 h-3.5 text-gray-400' />
                <span>弹幕类型</span>
              </div>
              <div className='flex gap-2'>
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
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      settings.modes.includes(option.value)
                        ? 'bg-green-500 text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/15'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 刷新按钮 */}
            {onReload && (
              <button
                onClick={onReload}
                disabled={loading}
                className='w-full py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors'
              >
                {loading ? '加载中...' : '刷新弹幕'}
              </button>
            )}
          </>
        )}
      </div>

      {/* 底部小三角指示器 */}
      <div className='absolute -bottom-1.5 right-6 w-3 h-3 bg-gray-900/95 border-r border-b border-white/10 transform rotate-45' />
    </div>
  );
});

export default DanmuSettingsPanel;
