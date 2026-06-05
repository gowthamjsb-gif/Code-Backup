import React from 'react';
import { motion } from 'framer-motion';
import Hero3D from './Hero3D';

const Hero = () => {
  return (
    <section id="hero" className="section-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: '2rem' }}>
      
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '1.2rem', marginBottom: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          ERP Executive & Developer
        </p>
        <h1 style={{ fontSize: '4.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '1.5rem', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          DHARSHAN S S
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '3rem', maxWidth: '600px' }}>
          Results-oriented B.E. CSE graduate leveraging Python, SQL, and process automation to drive operational efficiency and data-informed decision making.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <motion.a 
            href="#projects" 
            style={{ background: 'var(--primary)', color: 'white', padding: '1rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 500 }}
            whileHover={{ scale: 1.05, backgroundColor: 'var(--primary-dark)' }}
            whileTap={{ scale: 0.95 }}
          >
            View Projects
          </motion.a>
          <motion.a 
            href="#contact" 
            style={{ background: 'white', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '1rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 500 }}
            whileHover={{ scale: 1.05, backgroundColor: 'var(--bg-color)' }}
            whileTap={{ scale: 0.95 }}
          >
            Contact Me
          </motion.a>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
        style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >
        <Hero3D />
      </motion.div>

    </section>
  );
};

export default Hero;
