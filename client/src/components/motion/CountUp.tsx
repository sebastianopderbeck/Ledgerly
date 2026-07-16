import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";

interface CountUpProps {
  value: number;
  format: (value: number) => string;
  duration?: number;
}

export const CountUp = ({ value, format, duration = 0.9 }: CountUpProps) => {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(motionValue, (current) => format(current));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [value, duration, reduceMotion, motionValue]);

  return <motion.span>{text}</motion.span>;
};
