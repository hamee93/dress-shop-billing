const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (row) {
            res.json({ message: "Login success", user: { id: row.id, username: row.username, role: row.role } });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    });
});

app.post('/api/change-password', (req, res) => {
    const { username, newPassword } = req.body;
    db.run("UPDATE users SET password = ? WHERE username = ?", [newPassword, username], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Password updated successfully" });
    });
});

// Products API
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/products', (req, res) => {
    const { name, category, price, stock } = req.body;
    db.run("INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)", [name, category, price, stock], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID });
    });
});

app.put('/api/products/:id', (req, res) => {
    const { name, category, price, stock } = req.body;
    db.run(
        "UPDATE products SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?",
        [name, category, price, stock, req.params.id],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: "Product updated" });
        }
    );
});

app.delete('/api/products/:id', (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", [req.params.id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Product deleted" });
    });
});

// Sales API
app.post('/api/sales', (req, res) => {
    const { cashier_id, items } = req.body; // items: [{product_id, quantity, price}]
    const date = new Date().toISOString().split('T')[0];

    let total_amount = 0;
    items.forEach(item => total_amount += (item.quantity * item.price));

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.run("INSERT INTO sales (date, total_amount, cashier_id) VALUES (?, ?, ?)", [date, total_amount, cashier_id], function (err) {
            if (err) {
                db.run("ROLLBACK");
                res.status(500).json({ error: "Sale failed" });
                return;
            }
            const sale_id = this.lastID;

            const stmt = db.prepare("INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)");
            const updateStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

            items.forEach(item => {
                stmt.run(sale_id, item.product_id, item.quantity, item.price);
                updateStock.run(item.quantity, item.product_id);
            });

            stmt.finalize();
            updateStock.finalize();

            db.run("COMMIT");
            res.json({ message: "Sale recorded", sale_id });
        });
    });
});

// Reports API
app.get('/api/reports/daily', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT p.name, p.category, SUM(si.quantity) as quantity_sold, SUM(si.quantity * si.price_at_sale) as revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE s.date = ?
        GROUP BY p.id
    `;

    db.all(sql, [today], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        db.get("SELECT SUM(total_amount) as total_sales FROM sales WHERE date = ?", [today], (err, totalRow) => {
            res.json({
                date: today,
                total_sales: totalRow.total_sales || 0,
                items: rows
            });
        });
    });
});

const fs = require('fs');

app.delete('/api/reports/daily', (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1. Get total sales for today to archive in database
        db.get("SELECT SUM(total_amount) as total FROM sales WHERE date = ?", [today], (err, row) => {
            if (err || !row || !row.total) {
                // proceed or handle empty
            }

            const totalSales = row ? row.total : 0;

            if (totalSales > 0) {
                // 2. Fetch detailed data for CSV archiving
                const reportSql = `
                    SELECT p.name, p.category, SUM(si.quantity) as qty, SUM(si.quantity * si.price_at_sale) as rev
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    JOIN products p ON p.id = si.product_id
                    WHERE s.date = ?
                    GROUP BY p.id
                `;
                db.all(reportSql, [today], (err, rows) => {
                    if (!err && rows.length > 0) {
                        // Create CSV Content
                        let csvContent = "Product,Category,Qty Sold,Revenue\n";
                        rows.forEach(r => {
                            csvContent += `${r.name},${r.category},${r.qty},${r.rev}\n`;
                        });
                        csvContent += `\nTOTAL,,,${totalSales}`;

                        // Save to file
                        const filePath = path.join(__dirname, 'archived_reports', `report_${today}.csv`);
                        fs.writeFile(filePath, csvContent, (err) => {
                            if (err) console.error("Failed to archive file:", err);
                        });
                    }
                });

                // 3. Save to daily_summaries table
                db.run("INSERT OR REPLACE INTO daily_summaries (date, total_sales) VALUES (?, ?)", [today, totalSales]);
            }

            // 4. Proceed to Delete Actual Records
            db.all("SELECT id FROM sales WHERE date = ?", [today], (err, rows) => {
                if (err) {
                    db.run("ROLLBACK");
                    res.status(500).json({ error: err.message });
                    return;
                }

                if (rows.length === 0) {
                    db.run("COMMIT");
                    return res.json({ message: "No sales to clear" });
                }

                const saleIds = rows.map(row => row.id).join(',');

                db.run(`DELETE FROM sale_items WHERE sale_id IN (${saleIds})`, function (err) {
                    if (err) {
                        db.run("ROLLBACK");
                        res.status(500).json({ error: err.message });
                        return;
                    }

                    db.run("DELETE FROM sales WHERE date = ?", [today], function (err) {
                        if (err) {
                            db.run("ROLLBACK");
                            res.status(500).json({ error: err.message });
                            return;
                        }
                        db.run("COMMIT");
                        res.json({ message: "Daily report archived and sales cleared" });
                    });
                });
            });
        });
    });
});

app.get('/api/reports/monthly', (req, res) => {
    const { month } = req.query; // Format: 'YYYY-MM'
    if (!month) return res.status(400).json({ error: "Month required" });

    db.all("SELECT * FROM daily_summaries WHERE strftime('%Y-%m', date) = ?", [month], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Access on LAN: Find your IP (ipconfig) and use http://YOUR_IP:${PORT}`);
});
