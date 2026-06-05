import React from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import AboutSkills from './components/AboutSkills';
import Experience from './components/Experience';
import Projects from './components/Projects';
import Contact from './components/Contact';
import './index.css';

function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AboutSkills />
        <Experience />
        <Projects />
        <Contact />
      </main>
    </>
  );
}

export default App;
