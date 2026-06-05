/**
 * Price Chart Logic
 */

// 1. Configuration & Data
const qualities = [
  "PREMIUM", "PLATINUM", "S.PLATINUM", "GOLD", "SILVER", "BRONZE", 
  "CLASSIC", "SUPER CLASSIC", "LIFESTYLE", "ECO SPL", "ECO GREEN", 
  "SUPER ECO", "ULTRA", "DELUXE"
];

// Initial Base Prices
let basePrices = {
  "PREMIUM": 161.00, "PLATINUM": 153.50, "S.PLATINUM": 150.00, "GOLD": 144.00,
  "SILVER": 141.50, "BRONZE": 136.50, "CLASSIC": 132.00, "SUPER CLASSIC": 127.00,
  "LIFESTYLE": 123.00, "ECO SPL": 114.50, "ECO GREEN": 111.50, "SUPER ECO": 107.50,
  "ULTRA": 103.00, "DELUXE": 95.00
};

// Initial Customers
let customers = [
  { name: "SELVAM TRADERS", transport: 2.50, premium: 0, discount: 0 },
  { name: "KING TRADERS", transport: 2.50, premium: 0, discount: 0 },
  { name: "RISHABH FABRICS", transport: 2.50, premium: 0, discount: 0 },
  { name: "AZKARA FABRICS", transport: 0.00, premium: 5.50, discount: 0 },
  { name: "ST GEORGE", transport: 3.00, premium: 0, discount: 1.50 },
  { name: "INLITE", transport: 3.50, premium: 4.00, discount: 0 },
  { name: "SCANDIA", transport: 3.00, premium: 0, discount: 1.50 },
  { name: "GREEN EXPORT", transport: 1.50, premium: 5.00, discount: 0 },
  { name: "KURRIKAL FURNISHING", transport: 3.50, premium: 10.00, discount: 0 }
];

let isBaseEditMode = false;

// 2. DOM Elements
const tableHeadRow = document.querySelector('.row-head-labels');
const rowBasePrices = document.getElementById('rowBasePrices');
const tableBody = document.getElementById('tableBody');
const toggleBaseEditBtn = document.getElementById('toggleBaseEdit');
const btnAddCustomer = document.getElementById('btnAddCustomer');

const modalBackdrop = document.getElementById('modalBackdrop');
const btnModalClose = document.getElementById('btnModalClose');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalSave = document.getElementById('btnModalSave');

const inpCustomerName = document.getElementById('inpCustomerName');
const inpTransport = document.getElementById('inpTransport');
const selCategory = document.getElementById('selCategory');
const inpAmount = document.getElementById('inpAmount');
const toastEl = document.getElementById('toast');

// Formatter for Currency
const formatCurrency = (val) => {
  if (!val && val !== 0) return "";
  return `₹ ${Number(val).toFixed(2)}`;
};

// 3. Initialization
function initTable() {
  // Add Quality Headers
  qualities.forEach((q, idx) => {
    const th = document.createElement('th');
    th.className = 'col-quality';
    th.textContent = q;
    tableHeadRow.appendChild(th);
  });
  
  renderBasePrices();
  renderCustomers();
}

function renderBasePrices() {
  rowBasePrices.innerHTML = `
    <th class="sticky-left" style="background: inherit; border-bottom: none;"></th>
    <th class="sticky-left-2" style="background: inherit; border-bottom: none;"></th>
    <th class="sticky-left-3" style="background: inherit; border-bottom: none;"></th>
    <th class="sticky-left-4" style="background: inherit; border-bottom: none;"></th>
  `;
  
  qualities.forEach(q => {
    const th = document.createElement('th');
    if (isBaseEditMode) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'edit-input';
      input.value = basePrices[q];
      input.step = "0.50";
      input.addEventListener('change', (e) => {
        basePrices[q] = parseFloat(e.target.value) || 0;
        renderCustomers(); // re-calculate
      });
      th.appendChild(input);
    } else {
      th.textContent = formatCurrency(basePrices[q]);
    }
    rowBasePrices.appendChild(th);
  });
}

function calculatePrice(basePrice, transport, premium, discount) {
  return basePrice + (transport || 0) + (premium || 0) - (discount || 0);
}

function renderCustomers() {
  tableBody.innerHTML = '';
  
  customers.forEach((c, index) => {
    const tr = document.createElement('tr');
    
    // Customer Info Columns (Sticky)
    tr.innerHTML = `
      <td class="sticky-left customer-name" style="background: inherit;">${c.name}</td>
      <td class="sticky-left-2 val-transport" style="background: inherit;">${formatCurrency(c.transport)}</td>
      <td class="sticky-left-3 val-premium" style="background: inherit;">${c.premium ? formatCurrency(c.premium) : ''}</td>
      <td class="sticky-left-4 val-discount" style="background: inherit;">${c.discount ? formatCurrency(c.discount) : ''}</td>
    `;
    
    // Calculated Quality Prices
    qualities.forEach(q => {
      const base = basePrices[q];
      const finalPrice = calculatePrice(base, c.transport, c.premium, c.discount);
      
      const td = document.createElement('td');
      td.className = 'val-price';
      
      // Highlight if modified by premium or discount
      if (c.premium > 0 || c.discount > 0) {
        td.classList.add('highlight');
      }
      
      td.textContent = formatCurrency(finalPrice);
      tr.appendChild(td);
    });
    
    tableBody.appendChild(tr);
  });
}

// 4. Interactivity

// Toggle Base Price Edit Mode
toggleBaseEditBtn.addEventListener('click', () => {
  isBaseEditMode = !isBaseEditMode;
  toggleBaseEditBtn.classList.toggle('active', isBaseEditMode);
  toggleBaseEditBtn.textContent = isBaseEditMode ? 'Done Editing' : 'Edit Base Prices';
  renderBasePrices();
  if(!isBaseEditMode) showToast("Base prices updated!");
});

// Modal Logic
function openModal() {
  inpCustomerName.value = '';
  inpTransport.value = '';
  selCategory.value = 'none';
  inpAmount.value = '';
  modalBackdrop.classList.add('show');
}

function closeModal() {
  modalBackdrop.classList.remove('show');
}

btnAddCustomer.addEventListener('click', openModal);
btnModalClose.addEventListener('click', closeModal);
btnModalCancel.addEventListener('click', closeModal);

selCategory.addEventListener('change', () => {
  if (selCategory.value === 'none') {
    inpAmount.value = '';
    inpAmount.disabled = true;
  } else {
    inpAmount.disabled = false;
  }
});
inpAmount.disabled = true; // initial state

btnModalSave.addEventListener('click', () => {
  const name = inpCustomerName.value.trim();
  if (!name) return alert("Customer name is required!");
  
  const transport = parseFloat(inpTransport.value) || 0;
  let premium = 0;
  let discount = 0;
  
  const amount = parseFloat(inpAmount.value) || 0;
  if (selCategory.value === 'premium') premium = amount;
  if (selCategory.value === 'discount') discount = amount;
  
  customers.push({ name, transport, premium, discount });
  renderCustomers();
  closeModal();
  
  // scroll to bottom
  const scrollContainer = document.querySelector('.table-scroll');
  scrollContainer.scrollTop = scrollContainer.scrollHeight;
  
  showToast(`Added ${name} successfully!`);
});

// Toast functionality
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

// Mock actions
document.getElementById('btnExport').addEventListener('click', () => {
  showToast("Exporting to CSV...");
});

document.getElementById('btnSaveERPNext').addEventListener('click', () => {
  showToast("Syncing data to ERPNext Document...");
});

// 5. Run Init
initTable();
