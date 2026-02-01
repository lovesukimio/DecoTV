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
import { memo, useCallback } from 'react';

import type { DanmuSettings } from '@/hooks/useDanmu';

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
}

// ============================================================================
// Sub Components
// ============================================================================

/**
 * 滑块组件
 */
const Slider = memo(function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  icon: Icon,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  icon?: React.ElementType;
  onChange: (value: number) => void;
}) {
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300'>
          {Icon && <Icon className='w-4 h-4' />}
          <span>{label}</span>
        </div>
        <span className='text-sm text-gray-500 dark:text-gray-400'>
          {value}
          {unit}
        </span>
      </div>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className='w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500'
      />
    </div>
  );
});

/**
 * 开关组件
 */
const Toggle = memo(function Toggle({
  label,
  checked,
  icon: Icon,
  onChange,
}: {
  label: string;
  checked: boolean;
  icon?: React.ElementType;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className='flex items-center justify-between'>
      <div className='flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300'>
        {Icon && <Icon className='w-4 h-4' />}
        <span>{label}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
});

/**
 * 弹幕模式选择器
 */
const ModeSelector = memo(function ModeSelector({
  modes,
  onChange,
}: {
  modes: number[];
  onChange: (modes: number[]) => void;
}) {
  const modeOptions = [
    { value: 0, label: '滚动' },
    { value: 1, label: '顶部' },
    { value: 2, label: '底部' },
  ];

  const toggleMode = (mode: number) => {
    if (modes.includes(mode)) {
      // 至少保留一种模式
      if (modes.length > 1) {
        onChange(modes.filter((m) => m !== mode));
      }
    } else {
      onChange([...modes, mode]);
    }
  };

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300'>
        <Layers className='w-4 h-4' />
        <span>弹幕类型</span>
      </div>
      <div className='flex gap-2'>
        {modeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => toggleMode(option.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              modes.includes(option.value)
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
});

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
}: DanmuSettingsPanelProps) {
  // 处理设置更新
  const handleUpdate = useCallback(
    <K extends keyof DanmuSettings>(key: K, value: DanmuSettings[K]) => {
      onSettingsChange({ [key]: value });
    },
    [onSettingsChange],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div className='fixed inset-0 bg-black/40 z-[100]' onClick={onClose} />

      {/* 紧凑弹出面板 - 居中显示 */}
      <div className='fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[320px] max-w-[90vw] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden animate-scale-in'>
        {/* 头部 - 更紧凑 */}
        <div className='flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'>
          <div className='flex items-center gap-2'>
            <MessageSquare className='w-4 h-4 text-green-600 dark:text-green-400' />
            <span className='font-semibold text-gray-900 dark:text-gray-100'>
              弹幕设置
            </span>
            <span className='text-xs text-gray-500 dark:text-gray-400 ml-1'>
              {loading ? '加载中...' : `${danmuCount}条`}
            </span>
          </div>
          <button
            onClick={onClose}
            className='p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors'
          >
            <X className='w-4 h-4 text-gray-500' />
          </button>
        </div>

        {/* 内容区域 - 更紧凑 */}
        <div className='p-3 space-y-3 max-h-[60vh] overflow-y-auto'>
          {/* 主开关行 */}
          <div className='flex items-center gap-2'>
            <Toggle
              label='启用弹幕'
              checked={settings.enabled}
              onChange={(checked) => handleUpdate('enabled', checked)}
            />
          </div>

          {settings.enabled && (
            <>
              {/* 快捷开关行 */}
              <div className='flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                <Toggle
                  label='显示'
                  checked={settings.visible}
                  icon={Eye}
                  onChange={(checked) => handleUpdate('visible', checked)}
                />
                <Toggle
                  label='防重叠'
                  checked={settings.antiOverlap}
                  icon={Shield}
                  onChange={(checked) => handleUpdate('antiOverlap', checked)}
                />
              </div>

              {/* 滑块设置 - 紧凑排列 */}
              <div className='space-y-2'>
                <Slider
                  label='字号'
                  value={settings.fontSize}
                  min={12}
                  max={48}
                  step={1}
                  unit='px'
                  icon={Type}
                  onChange={(value) => handleUpdate('fontSize', value)}
                />

                <Slider
                  label='速度'
                  value={settings.speed}
                  min={1}
                  max={10}
                  step={1}
                  icon={Gauge}
                  onChange={(value) => handleUpdate('speed', value)}
                />

                <Slider
                  label='透明'
                  value={settings.opacity}
                  min={0.1}
                  max={1}
                  step={0.1}
                  icon={Eye}
                  onChange={(value) => handleUpdate('opacity', value)}
                />
              </div>

              {/* 弹幕类型 */}
              <ModeSelector
                modes={settings.modes}
                onChange={(modes) => handleUpdate('modes', modes)}
              />

              {/* 刷新按钮 */}
              {onReload && (
                <button
                  onClick={onReload}
                  disabled={loading}
                  className='w-full py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors'
                >
                  {loading ? '加载中...' : '刷新弹幕'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 动画样式 */}
      <style jsx>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
});

export default DanmuSettingsPanel;
