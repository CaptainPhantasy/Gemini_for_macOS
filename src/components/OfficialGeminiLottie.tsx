import { useEffect, useRef } from 'react';
import lottie from 'lottie-web/build/player/lottie_light';
import type { AnimationItem } from 'lottie-web';

type OfficialGeminiLottieProps = {
  src: string;
  className?: string;
  loop?: boolean;
  ariaLabel?: string;
};

export function OfficialGeminiLottie({
  src,
  className,
  loop = true,
  ariaLabel,
}: OfficialGeminiLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animation: AnimationItem | null = null;
    let cancelled = false;

    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load Gemini animation: ${response.status}`);
        return response.json();
      })
      .then((animationData) => {
        if (cancelled || !containerRef.current) return;
        animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: loop && !prefersReducedMotion,
          autoplay: !prefersReducedMotion,
          animationData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
          },
        });
        if (prefersReducedMotion) animation.goToAndStop(0, true);
      })
      .catch(() => {
        container.dataset.animationFallback = 'true';
      });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [loop, src]);

  return (
    <div
      ref={containerRef}
      className={className}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  );
}
