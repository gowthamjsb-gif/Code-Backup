import React from 'react';
import { motion } from 'framer-motion';

const skills = [
  'Python', 'C', 'C++', 'Java (OOPS)', 
  'Power BI', 'MS Excel', 'MySQL', 
  'HTML', 'CSS', 'SAP MM', 'Digital Marketing'
];

const softSkills = [
  'Project Management', 'Public Relations', 'Teamwork', 
  'Time Management', 'Leadership', 'Effective Communication', 'Critical Thinking'
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const AboutSkills = () => {
  return (
    <section id="about" className="section-container">
      <motion.h2 
        initial={{ opacity: 0, x: -30 }} 
        whileInView={{ opacity: 1, x: 0 }} 
        viewport={{ once: true, margin: "-100px" }}
      >
        About & Skills
      </motion.h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        
        <motion.div 
          className="card"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          whileHover={{ y: -5 }}
        >
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--primary)' }}>Education</h3>
          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>B.E. Computer Science and Engineering</h4>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>K.L.N. College of Engineering</p>
            <span className="tag" style={{ background: '#f1f5f9', color: 'var(--text-muted)' }}>GPA: 8.2 / 10.0</span>
          </div>
          
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary)' }}>Certifications</h3>
          <ul style={{ listStylePosition: 'inside', color: 'var(--text-muted)' }}>
            <li style={{ marginBottom: '0.5rem' }}>Java</li>
            <li style={{ marginBottom: '0.5rem' }}>AWS Cloud Practitioner</li>
            <li style={{ marginBottom: '0.5rem' }}>C, C++</li>
          </ul>
        </motion.div>

        <motion.div 
          className="card"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ delay: 0.2 }}
          whileHover={{ y: -5 }}
        >
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary)' }}>Technical Skills</h3>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}
          >
            {skills.map((skill, index) => (
              <motion.span variants={itemVariants} key={index} className="tag">{skill}</motion.span>
            ))}
          </motion.div>
          
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary)' }}>Soft Skills</h3>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
          >
            {softSkills.map((skill, index) => (
              <motion.span variants={itemVariants} key={index} className="tag" style={{ background: '#f8fafc', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>{skill}</motion.span>
            ))}
          </motion.div>
        </motion.div>

      </div>
    </section>
  );
};

export default AboutSkills;
