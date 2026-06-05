import React from 'react';
import { motion } from 'framer-motion';

const experiences = [
  {
    title: 'ERP Executive',
    company: 'Jayashree Spun Bond, Bangalore',
    date: 'June 2025 - Present',
    details: 'Configured automation workflows to simplify lead tracking and operational tasks, resulting in improved system efficiency across 4 production units. Oversaw production, inventory, and sales data accuracy within the Deskera ERP system to ensure seamless operations.'
  },
  {
    title: 'ERP Implementation Trainee',
    company: 'Jayashree Spun Bond, Madurai',
    date: 'Oct 2024 - May 2025',
    details: 'Managed cross-module ERP functions by preparing Material Masters for MRP and tracking financials in the Accounting module. Deployed sales Operations in the CRM module to streamline customer relationship data.'
  },
  {
    title: 'Data Analyst',
    company: 'AICTE - IBM, Remote, India',
    date: 'June 2023 - Aug 2023',
    details: 'Developed interactive data visualizations for Superstore dataset using Python libraries (Pandas, Matplotlib, NumPy) to highlight sales trends and business insights. Achieved a 15% rise in user satisfaction by transforming raw data into actionable visual reports.'
  }
];

const Experience = () => {
  return (
    <section id="experience" className="section-container">
      <motion.h2 
        initial={{ opacity: 0, x: -30 }} 
        whileInView={{ opacity: 1, x: 0 }} 
        viewport={{ once: true, margin: "-100px" }}
      >
        Work Experience
      </motion.h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)' }}>
        {experiences.map((exp, index) => (
          <motion.div 
            key={index} 
            className="card" 
            style={{ position: 'relative', marginLeft: '1rem' }}
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            whileHover={{ scale: 1.02 }}
          >
            {/* Timeline Dot */}
            <motion.div 
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 + 0.3 }}
              style={{
                position: 'absolute',
                left: '-2.4rem',
                top: '2.5rem',
                width: '12px',
                height: '12px',
                backgroundColor: 'var(--primary)',
                borderRadius: '50%',
                border: '3px solid var(--bg-color)'
              }} 
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{exp.title}</h3>
                <p style={{ color: 'var(--primary)', fontWeight: 500 }}>{exp.company}</p>
              </div>
              <span className="tag" style={{ background: '#f8fafc', color: 'var(--text-muted)', border: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
                {exp.date}
              </span>
            </div>
            
            <p style={{ color: 'var(--text-muted)' }}>
              {exp.details}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default Experience;
