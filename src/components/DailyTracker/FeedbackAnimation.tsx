'use client';

import { useEffect, useRef } from 'react';
import { Zap, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedbackAnimationProps {
  isVisible: boolean;
  onComplete: () => void;
  streakIncrement?: number;
  bonus?: string;
  /** The one prescriptive line the rule engine answered back with */
  noticed?: string | null;
}

export function FeedbackAnimation({
  isVisible,
  onComplete,
  streakIncrement = 1,
  bonus,
  noticed,
}: FeedbackAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      rotationSpeed: number;
      life: number;

      constructor(width: number, height: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height * 0.3; // Start from top half
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = Math.random() * 3 + 2; // Fall down
        this.size = Math.random() * 8 + 4;
        const colors = ['#E8652D', '#17A697', '#FFD700', '#FF69B4', '#87CEEB'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        this.life = 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // Gravity
        this.rotation += this.rotationSpeed;
        this.life -= 0.012;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
      }
    }

    // Create particles
    for (let i = 0; i < 30; i++) {
      particles.push(new Particle(canvas.width, canvas.height));
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);

        if (particles[i].life <= 0) {
          particles.splice(i, 1);
        }
      }

      if (particles.length > 0) {
        requestAnimationFrame(animate);
      }
    };

    animate();

    // Give the prescriptive line time to be read
    const timer = setTimeout(onComplete, noticed ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [isVisible, onComplete, noticed]);

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Confetti Canvas */}
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50"
          />

          {/* Success Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4, type: 'spring', stiffness: 100 }}
                className="flex justify-center mb-4"
              >
                <CheckCircle2 className="w-16 h-16 text-teal-600" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <h3 className="text-2xl font-bold text-stone-900 mb-2">
                  Logged! 🎉
                </h3>
                <p className="text-stone-600 mb-6">
                  {streakIncrement === 1
                    ? `Your streak is now ${streakIncrement} day!`
                    : `Great job staying consistent!`}
                </p>

                {noticed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="bg-stone-900 rounded-xl p-4 mb-4 text-left"
                  >
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-orange-400 mb-1">
                      CareerRai noticed
                    </p>
                    <p className="text-sm text-white leading-snug">{noticed}</p>
                  </motion.div>
                )}

                {bonus && !noticed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className="bg-gradient-to-r from-orange-50 to-teal-50 rounded-xl p-4 mb-4"
                  >
                    <div className="flex items-center justify-center gap-2 text-orange-600 font-semibold">
                      <Zap className="w-5 h-5" />
                      <span className="text-sm">{bonus}</span>
                    </div>
                  </motion.div>
                )}

                <p className="text-xs text-stone-500">
                  Come back tomorrow to keep your streak alive!
                </p>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
