'use client';

/**
 * 极光流体背景组件 (Aurora Mesh Gradient)
 * - 纯 CSS 实现，零 JS 主线程阻塞
 * - PC 端：多光斑、高透明度、丰富层次
 * - 移动端：少光斑、低透明度、极度轻量
 * - 使用 GPU 加速的 transform 动画
 */
export default function ParticleBackground() {
  return (
    <div className='fixed inset-0 z-[-1] overflow-hidden'>
      {/* 1. 基础底色 - 深邃黑渐变 */}
      <div className='absolute inset-0 bg-linear-to-b from-neutral-950 via-slate-950 to-black dark:from-neutral-950 dark:via-slate-950 dark:to-black' />

      {/* 亮色模式底色 */}
      <div className='absolute inset-0 bg-linear-to-b from-slate-100 via-gray-50 to-white dark:opacity-0 transition-opacity duration-500' />

      {/* ========== PC 端极光层 (md:block) ========== */}
      {/* 紫色光斑 - 左上 */}
      <div
        className='hidden md:block absolute -top-20 -left-20 w-96 h-96 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[100px] animate-blob'
        style={{
          background:
            'radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
        }}
      />

      {/* 青色光斑 - 右上 */}
      <div
        className='hidden md:block absolute -top-10 -right-20 w-96 h-96 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[100px] animate-blob'
        style={{
          background:
            'radial-gradient(circle, rgba(34,211,238,0.30) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
          animationDelay: '2s',
        }}
      />

      {/* 粉色光斑 - 左下 */}
      <div
        className='hidden md:block absolute -bottom-32 left-1/4 w-md h-112 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[120px] animate-blob'
        style={{
          background:
            'radial-gradient(circle, rgba(236,72,153,0.28) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
          animationDelay: '4s',
        }}
      />

      {/* 蓝色光斑 - 右下 */}
      <div
        className='hidden md:block absolute bottom-0 right-1/4 w-80 h-80 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[90px] animate-blob'
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
          animationDelay: '6s',
        }}
      />

      {/* 绿色光斑 - 中央偏上 */}
      <div
        className='hidden md:block absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[80px] animate-blob'
        style={{
          background:
            'radial-gradient(circle, rgba(52,211,153,0.20) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
          animationDelay: '3s',
        }}
      />

      {/* ========== 移动端极光层 (md:hidden) - 极致轻量 ========== */}
      {/* 紫蓝光斑 - 左上，数量少、透明度低、模糊小 */}
      <div
        className='md:hidden absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[50px] animate-blob-slow'
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
        }}
      />

      {/* 青蓝光斑 - 右下 */}
      <div
        className='md:hidden absolute bottom-20 -right-16 w-56 h-56 rounded-full mix-blend-screen dark:mix-blend-screen filter blur-[45px] animate-blob-slow'
        style={{
          background:
            'radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
          animationDelay: '5s',
        }}
      />

      {/* 3. 噪点纹理层 - 增加质感 */}
      <div
        className='absolute inset-0 opacity-[0.025] dark:opacity-[0.04] pointer-events-none'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 内联 Keyframes 定义 */}
      <style jsx>{`
        @keyframes blob {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          25% {
            transform: translate3d(30px, -50px, 0) scale(1.05);
          }
          50% {
            transform: translate3d(-20px, 20px, 0) scale(1.1);
          }
          75% {
            transform: translate3d(10px, -30px, 0) scale(0.95);
          }
        }

        @keyframes blob-slow {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(15px, -25px, 0) scale(1.05);
          }
        }

        .animate-blob {
          animation: blob 8s ease-in-out infinite;
        }

        .animate-blob-slow {
          animation: blob-slow 12s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
