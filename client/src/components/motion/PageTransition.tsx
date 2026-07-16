import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { pageTransition } from "./variants.js";

interface PageTransitionProps { children: ReactNode; }

export const PageTransition = ({ children }: PageTransitionProps) => (
  <motion.div variants={pageTransition} initial="initial" animate="animate" exit="exit">
    {children}
  </motion.div>
);
