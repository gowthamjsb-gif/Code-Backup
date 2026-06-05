// Initialize Mermaid with custom theme
mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    themeVariables: {
        fontSize: '14px',
        fontFamily: "'Outfit', sans-serif",
        primaryColor: '#6366f1',
        primaryTextColor: '#fff',
        primaryBorderColor: '#6366f1',
        lineColor: '#94a3b8',
        secondaryColor: '#a855f7',
        tertiaryColor: '#1e293b',
        mainBkg: '#1e293b',
        nodeBorder: '#6366f1',
        clusterBkg: 'rgba(255,255,255,0.02)',
        clusterBorder: 'rgba(255,255,255,0.1)'
    },
    flowchart: {
        curve: 'basis',
        padding: 50,
        nodeSpacing: 60,
        rankSpacing: 80
    }
});

const roles = [
    {
        id: 'domestic_crm',
        title: 'Domestic CRM',
        description: 'Handles local lead generation, quotations, and Sales Order creation for domestic clients.'
    },
    {
        id: 'export_crm',
        title: 'Export CRM',
        description: 'Manages international trade, currency conversions, export-specific quotations, and SOs.'
    },
    {
        id: 'accounts',
        title: 'Accounts Team',
        description: 'Performs credit checks, manages advances, processes final invoices, and reconciliation.'
    },
    {
        id: 'planning',
        title: 'Planning Team',
        description: 'Analyzes raw material availability and generates Production Plans from Sales Orders.'
    },
    {
        id: 'prod_admin',
        title: 'Production Admin',
        description: 'Creates BoMs, Work Orders, and monitors material issuance to the factory floor.'
    },
    {
        id: 'prod_coord',
        title: 'Production Coordinator',
        description: 'Optimizes production schedules and prioritizes jobs across various workstations.'
    },
    {
        id: 'prod_super',
        title: 'Production Supervisor',
        description: 'Executes Job Cards, manages floor-level manpower, and reports production updates.'
    },
    {
        id: 'despatch',
        title: 'Despatch Team',
        description: 'Final quality inspections, packing list creation, and Delivery Note generation.'
    },
    {
        id: 'super_admin',
        title: 'Super Admins',
        description: 'System-wide configuration, access control, and user role management.'
    },
    {
        id: 'erp_team',
        title: 'ERP Teams',
        description: 'Technical troubleshooting, report generation, and system optimization/updates.'
    }
];

function renderRoleList() {
    const list = document.getElementById('role-list');
    list.innerHTML = roles.map(role => `
        <div class="role-card" data-role="${role.id}">
            <div class="role-title">${role.title}</div>
            <div class="role-description">${role.description}</div>
        </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('.role-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            const roleId = card.getAttribute('data-role');
            // Logic to highlight Mermaid node can be added here if ids match
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderRoleList();
});
