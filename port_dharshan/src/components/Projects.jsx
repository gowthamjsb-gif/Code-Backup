import React from 'react';
import { motion } from 'framer-motion';

const projects = [
  {
    title: 'Stock Market Prediction Using Machine Learning',
    date: 'Aug 2024 - Oct 2024',
    tags: ['Python', 'R', 'ML Algorithms'],
    details: 'Designed and implemented algorithms to analyze historical stock data and identify predictive patterns. Leveraged statistical analysis and visualization tools to generate insights and present predictive results.'
  },
  {
    title: 'Superstore Sales Analysis',
    date: 'June 2023',
    tags: ['Python', 'Pandas', 'Matplotlib', 'Numpy', 'Jupyter'],
    details: 'Analyzed sales and revenue performance by branch and product line, creating visualizations that identified key trends to aid strategic decision-making.'
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 }
};

const Projects = () => {
  return (
    <section id="projects" className="section-container">
      <motion.h2 
        initial={{ opacity: 0, x: -30 }} 
        whileInView={{ opacity: 1, x: 0 }} 
        viewport={{ once: true, margin: "-100px" }}
      >
        Projects
      </motion.h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {projects.map((project, index) => (
          <motion.div 
            key={index} 
            className="card" 
            style={{ display: 'flex', flexDirection: 'column' }}
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            whileHover={{ y: -5, scale: 1.02 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{project.title}</h3>
            </div>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {project.date}
            </p>
            
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}
            >
              {project.tags.map((tag, i) => (
                <motion.span variants={itemVariants} key={i} className="tag" style={{ background: '#f8fafc', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                  {tag}
                </motion.span>
              ))}
            </motion.div>
            
            <p style={{ color: 'var(--text-main)', marginTop: 'auto' }}>
              {project.details}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default Projects;
