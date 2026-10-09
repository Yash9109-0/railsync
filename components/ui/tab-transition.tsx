"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"

interface TabTransitionProps {
  activeKey: string
  children: React.ReactNode
  className?: string
}

export function TabTransition({ activeKey, children, className }: TabTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

