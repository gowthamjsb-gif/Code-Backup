import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, ExternalLink } from 'lucide-react';

const Contact = () => {
  return (
    <section id="contact" className="section-container" style={{ minHeight: '80vh', justifyContent: 'center' }}>
      <motion.div 
        className="card" 
        style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--primary)', color: 'white', border: 'none' }}
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 style={{ color: 'white', borderBottom: 'none', marginBottom: '1rem' }}>Get in Touch</h2>
        <p style={{ fontSize: '1.1rem', marginBottom: '3rem', opacity: 0.9 }}>
          Ready to optimize your operations and drive efficiency? Let's connect.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
          
          <motion.div whileHover={{ y: -5 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={32} />
            <span style={{ fontWeight: 600 }}>Email</span>
            <a href="mailto:dharsofficialacc@gmail.com" style={{ color: 'white', textDecoration: 'none', opacity: 0.9 }}>
              dharsofficialacc@gmail.com
            </a>
          </motion.div>
          
          <motion.div whileHover={{ y: -5 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Phone size={32} />
            <span style={{ fontWeight: 600 }}>Phone</span>
            <a href="tel:9626133645" style={{ color: 'white', textDecoration: 'none', opacity: 0.9 }}>
              9626133645
            </a>
          </motion.div>
          
          <motion.div whileHover={{ y: -5 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={32} />
            <span style={{ fontWeight: 600 }}>Location</span>
            <span style={{ opacity: 0.9 }}>
              Madurai, Tamilnadu - 625001
            </span>
          </motion.div>
          
          <motion.div whileHover={{ y: -5 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <ExternalLink size={32} />
            <span style={{ fontWeight: 600 }}>LinkedIn</span>
            <a href="https://www.linkedin.com/in/dharshan20056/" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none', opacity: 0.9 }}>
              in/dharshan20056
            </a>
          </motion.div>
          
        </div>
      </motion.div>
      
      <p style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} Dharshan S S. All rights reserved.
      </p>
    </section>
  );
};

export default Contact;
