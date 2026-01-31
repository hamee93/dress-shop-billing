const API_URL = 'http://localhost:3000/api';
let currentUser = null;
let cart = [];
let allProducts = [];

// Login
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            currentUser = data.user;
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('app-view').style.display = 'block';
            loadProducts();

            // Role-based access control
            if (currentUser.role === 'owner') {
                document.getElementById('nav-products').style.display = 'inline-block';
                document.getElementById('nav-reports').style.display = 'inline-block';
            } else {
                document.getElementById('nav-products').style.display = 'none';
                document.getElementById('nav-reports').style.display = 'none';
            }

        } else {
            document.getElementById('login-error').innerText = data.message;
        }
    } catch (err) {
        alert('Login Error: ' + err.message);
    }
}

function logout() {
    location.reload();
}

// Tabs
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';

    if (tabId === 'billing') loadProducts(); // Refresh stock
    if (tabId === 'reports') loadDailyReport();
}

// Products
async function loadProducts() {
    const res = await fetch(`${API_URL}/products`);
    allProducts = await res.json();
    renderProductList();
    renderProductTable();
}

function renderProductList() {
    const list = document.getElementById('billing-product-list');
    list.innerHTML = '';
    allProducts.forEach(p => {
        if (p.stock > 0) {
            const div = document.createElement('div');
            div.className = 'product-card';
            div.innerHTML = `<h4>${p.name}</h4><p>₹${p.price}</p><p>Stock: ${p.stock}</p>`;
            div.onclick = () => addToCart(p);
            list.appendChild(div);
        }
    });
}

function renderProductTable() {
    const tbody = document.getElementById('products-list');
    tbody.innerHTML = '';
    allProducts.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td>₹${p.price}</td>
            <td>${p.stock}</td>
            <td>
                <button onclick="openEditModal(${p.id})">Edit</button>
                <button style="background-color: #dc3545;" onclick="deleteProduct(${p.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openEditModal(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    document.getElementById('edit-prod-id').value = product.id;
    document.getElementById('edit-prod-name').value = product.name;
    document.getElementById('edit-prod-cat').value = product.category;
    document.getElementById('edit-prod-price').value = product.price;
    document.getElementById('edit-prod-stock').value = product.stock;

    document.getElementById('edit-modal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveProductChanges() {
    const id = document.getElementById('edit-prod-id').value;
    const name = document.getElementById('edit-prod-name').value;
    const category = document.getElementById('edit-prod-cat').value;
    const price = document.getElementById('edit-prod-price').value;
    const stock = document.getElementById('edit-prod-stock').value;

    if (!name || !price || !stock) return alert('Fill all fields');

    try {
        const res = await fetch(`${API_URL}/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, price, stock })
        });

        if (res.ok) {
            alert('Product Updated');
            closeEditModal();
            loadProducts();
        } else {
            const data = await res.json();
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        const res = await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Product Deleted');

            // Also remove from cart if present
            cart = cart.filter(i => i.id !== id);
            renderCart();

            loadProducts();
        } else {
            const data = await res.json();
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Close modal if clicked outside
window.onclick = function (event) {
    const modal = document.getElementById('edit-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Old updateStock function removed as it is replaced by full edit


async function addProduct() {
    const name = document.getElementById('new-prod-name').value;
    const category = document.getElementById('new-prod-cat').value;
    const price = document.getElementById('new-prod-price').value;
    const stock = document.getElementById('new-prod-stock').value;

    if (!name || !price || !stock) return alert('Fill all fields');

    await fetch(`${API_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, price, stock })
    });

    alert('Product Added');
    loadProducts();
}



// Billing / Cart
function addToCart(product) {
    const existing = cart.find(i => i.id === product.id);
    if (existing) {
        if (existing.quantity < product.stock) {
            existing.quantity++;
        } else {
            alert('Out of stock!');
        }
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    renderCart();
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    container.innerHTML = '';
    let total = 0;
    cart.forEach(item => {
        total += item.price * item.quantity;
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <span>${item.name} (${item.quantity})</span>
            <span>₹${item.price * item.quantity}</span>
            <button style="width:auto; padding:5px; background:red;" onclick="removeFromCart(${item.id})">X</button>
        `;
        container.appendChild(div);
    });
    document.getElementById('cart-total').innerText = total;
}

async function processSale() {
    if (cart.length === 0) return alert('Cart is empty');

    const items = cart.map(item => ({ product_id: item.id, quantity: item.quantity, price: item.price }));

    const res = await fetch(`${API_URL}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier_id: currentUser.id, items })
    });

    if (res.ok) {
        const data = await res.json();
        if (confirm('Sale Recorded! Print Receipt?')) {
            printReceipt(data.sale_id, items, currentUser.username);
        }
        cart = [];
        renderCart();
        loadProducts(); // Update stock
    } else {
        alert('Error processing sale');
    }
}

// Reports
async function loadDailyReport() {
    const res = await fetch(`${API_URL}/reports/daily`);
    const data = await res.json();

    document.getElementById('daily-total').innerText = data.total_sales;

    const tbody = document.getElementById('report-list');
    tbody.innerHTML = '';
    if (data.items) {
        data.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity_sold}</td>
                <td>₹${item.revenue}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function exportReport() {
    // Simple CSV export
    const rows = [];
    rows.push(["Product", "Category", "Qty Sold", "Revenue"]);

    const tableRows = document.querySelectorAll("#report-list tr");
    tableRows.forEach(tr => {
        const cols = tr.querySelectorAll("td");
        const row = [cols[0].innerText, cols[1].innerText, cols[2].innerText, cols[3].innerText];
        rows.push(row.join(","));
    });

    const total = document.getElementById('daily-total').innerText;
    rows.push(["", "", "TOTAL", total]);

    const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "daily_report.csv");
    document.body.appendChild(link);
    link.click();
}

async function clearDailyReport() {
    if (!confirm('Are you sure you want to CLEAR today\'s sales? This cannot be undone.')) return;

    // Double confirmation for security
    const password = prompt("Enter Owner Password to confirm:");
    // In a real app, verify this on backend. For simple request, simple check:
    if (password !== 'admin123') return alert('Incorrect password');

    try {
        const res = await fetch(`${API_URL}/reports/daily`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            loadDailyReport();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function printReceipt(saleId, items, cashierName) {
    const date = new Date().toLocaleString();
    document.getElementById('receipt-date').innerText = date;
    document.getElementById('receipt-id').innerText = saleId;

    const tbody = document.getElementById('receipt-items');
    tbody.innerHTML = '';

    let total = 0;
    items.forEach(item => {
        const product = allProducts.find(p => p.id === item.product_id);
        const name = product ? product.name : 'Unknown';
        const lineTotal = item.quantity * item.price;
        total += lineTotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td>${item.quantity}</td>
            <td>${lineTotal}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('receipt-total').innerText = total;

    window.print();
}
