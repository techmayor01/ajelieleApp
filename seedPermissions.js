// seedPermissions.js
require("dotenv").config(); // Load .env vars

const mongoose = require("mongoose");
const Permission = require("./model/Permission");

const permissions = [
  // ===== Main =====
  { module: "Main", name: "view-dashboard" },

  // ===== Inventory =====
  { module: "Inventory", name: "view-inventory" },

  // Stores
  { module: "Stores", name: "view-stores" },
  { module: "Stores", name: "create-store" },
  { module: "Stores", name: "modify-store" },
  { module: "Stores", name: "delete-store" },

  // Branch
  { module: "Branch", name: "view-branches" },
  { module: "Branch", name: "add-branch" },
  { module: "Branch", name: "modify-branch" },
  { module: "Branch", name: "delete-branch" },

  // Expired Products
  { module: "Expired Products", name: "view-expired-products" },
  { module: "Expired Products", name: "edit-expired-products" },

  // Low Stocks
  { module: "Low Stocks", name: "view-low-stocks" },

  // Category
  { module: "Category", name: "view-categories" },
  { module: "Category", name: "add-category" },
  { module: "Category", name: "modify-category" },
  { module: "Category", name: "delete-category" },

  // Units
  { module: "Units", name: "view-units" },
  { module: "Units", name: "add-units" },
  { module: "Units", name: "modify-units" },
  { module: "Units", name: "delete-units" },

  // Stock
  { module: "Stock", name: "add-stock" },
  { module: "Stock", name: "edit-stock" },
  { module: "Stock", name: "delete-stock" },

  // Manage Stock
  { module: "Manage Stock", name: "manage-stock" },

  // Stock Adjustment
  { module: "Stock Adjustment", name: "stock-adjustment" },

  // Price Adjustment
  { module: "Price Adjustment", name: "price-adjustment" },

  // Stock Transfer
  { module: "Stock Transfer", name: "stock-transfer" },

  // ===== Sales =====
  { module: "Sales", name: "view-sales" },
  { module: "Sales", name: "create-sales" },
  { module: "Sales", name: "modify-sales" },
  { module: "Sales", name: "delete-sales" },
  { module: "Sales", name: "manage-refunds" },

  // ===== Purchases =====
  { module: "Purchases", name: "view-purchases" },
  { module: "Purchases", name: "create-purchase" },
  { module: "Purchases", name: "modify-purchase" },
  { module: "Purchases", name: "delete-purchase" },

  // Purchase Order
  { module: "Purchase Order", name: "view-purchase-orders" },
  { module: "Purchase Order", name: "create-purchase-order" },
  { module: "Purchase Order", name: "modify-purchase-order" },
  { module: "Purchase Order", name: "delete-purchase-order" },

  // ===== Finance & Accounts =====
  { module: "Expenses", name: "view-expenses" },
  { module: "Expenses", name: "add-expenses" },
  { module: "Expenses", name: "modify-expenses" },
  { module: "Expenses", name: "delete-expenses" },

  // Supplier Invoice
  { module: "Supplier Invoice", name: "view-supplier-invoices" },
  { module: "Supplier Invoice", name: "modify-supplier-invoice" },

  // Payments
  { module: "Payments", name: "view-payments" },
  { module: "Payments", name: "modify-payments" },
  { module: "Payments", name: "delete-payments" },

  // Loan
  { module: "Loan", name: "create-loan" },
  { module: "Loan", name: "view-loans" },
  { module: "Loan", name: "modify-loan" },
  { module: "Loan", name: "delete-loan" },

  // ===== Peoples =====
  { module: "Customers", name: "view-customers" },
  { module: "Customers", name: "create-customer" },
  { module: "Customers", name: "modify-customer" },
  { module: "Customers", name: "delete-customer" },

  { module: "Loaners", name: "view-loaners" },
  { module: "Loaners", name: "create-loaner" },

  { module: "Suppliers", name: "view-suppliers" },
  { module: "Suppliers", name: "create-supplier" },
  { module: "Suppliers", name: "modify-supplier" },
  { module: "Suppliers", name: "delete-supplier" },

  // ===== Reports =====
  { module: "Reports", name: "sales-report" },
  { module: "Reports", name: "purchase-report" },
  { module: "Reports", name: "inventory-report" },
  { module: "Reports", name: "stock-report" },
  { module: "Reports", name: "sold-stock" },
  { module: "Reports", name: "parking-store-report" },
  { module: "Reports", name: "supplier-report" },
  { module: "Reports", name: "customer-report" },
  { module: "Reports", name: "expense-report" },
  { module: "Reports", name: "profit-loss" },

  // ===== User Management =====
  { module: "Users", name: "view-users" },
  { module: "Users", name: "create-user" },
  { module: "Users", name: "modify-user" },
  { module: "Users", name: "delete-user" },

  { module: "Roles & Permissions", name: "view-roles" },
  { module: "Roles & Permissions", name: "create-role" },
  { module: "Roles & Permissions", name: "modify-role" },
  { module: "Roles & Permissions", name: "delete-role" },
  { module: "Roles & Permissions", name: "manage-permissions" },

  // Profile
  { module: "Profile", name: "view-profile" },
  { module: "Profile", name: "modify-profile" },

  // Logout
  { module: "Logout", name: "logout" },

  // ===== Logs =====
  { module: "Logs", name: "view-logs" },

  // ===== Backup =====
  { module: "Backup", name: "view-backup" },
  { module: "Backup", name: "create-backup" },
  { module: "Backup", name: "restore-backup" },
];

async function seed() {
  try {
    await mongoose.connect(process.env.DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    await Permission.deleteMany({});
    await Permission.insertMany(permissions);

    console.log("✅ Permissions seeded successfully");
  } catch (err) {
    console.error("❌ Error seeding permissions:", err);
  } finally {
    mongoose.connection.close();
  }
}

seed();
