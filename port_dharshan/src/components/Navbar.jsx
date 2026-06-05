import React from 'react';
import { motion } from 'framer-motion';

const Navbar = () => {
  return (
    <motion.nav 
      className="navbar"
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--primary)' }}>
        DHARSHAN S S
      </div>
      <div className="nav-links">
        <a href="#about" className="nav-link">About & Skills</a>
        <a href="#experience" className="nav-link">Experience</a>
        <a href="#projects" className="nav-link">Projects</a>
        <a href="#contact" className="nav-link">Contact</a>
      </div>
    </motion.nav>
  );
};

export default Navbar;
