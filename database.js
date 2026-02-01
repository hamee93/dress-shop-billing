const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./shop.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        // Products Table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            category TEXT,
            price REAL,
            stock INTEGER
        )`);

        // Sales Table
        db.run(`CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            total_amount REAL,
            cashier_id INTEGER
        )`);

        // Sale Items Table
        db.run(`CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER,
            product_id INTEGER,
            quantity INTEGER,
            price_at_sale REAL,
            FOREIGN KEY(sale_id) REFERENCES sales(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )`);

        // Seed initial data if empty
        db.get("SELECT count(*) as count FROM users", (err, row) => {
            if (row.count === 0) {
                console.log("Seeding initial data...");
                const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
                // Default owner login: owner/admin123 (In real app, hash passwords!)
                stmt.run("owner", "zway123", "owner");
                // Default staff login: staff/staff123
                stmt.run("staff", "staff123", "staff");
                stmt.finalize();

                const prodStmt = db.prepare("INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)");
                prodStmt.run("Cotton Shirt", "Shirts", 500, 50);
                prodStmt.run("V-Neck T-Shirt", "T-Shirts", 300, 100);
                prodStmt.run("Denim Shorts", "Shorts", 400, 30);
                prodStmt.run("Running Track Pants", "Track Pants", 600, 40);
                prodStmt.run("Formal Pants", "Pants", 800, 60);
                prodStmt.finalize();
            }
        });
    });
}

module.exports = db;
