const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path')
const archiver = require('archiver');
const { exec } = require('child_process');
const multer = require('multer');
const moment = require('moment');
const numberToWords = require('number-to-words');
const mongoose = require("mongoose");

const backupsFolder = "C:\\Users\\TECH MAYOR\\application-backup";

// MULTER CONFIGURATION
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/media/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    },
})

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  if (allowedTypes.test(ext) && allowedTypes.test(mime)) {
    cb(null, true);
  } else {
    cb(new Error('Only .jpeg, .jpg, .png files are allowed'));
  }
};

const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter

 });


// CONNECTING MODELS 
const User = require("../model/User");
const Branch = require("../model/Branch");
const Customer = require("../model/Customer");
const CustomerLedger = require("../model/CustomerLedger");
const Supplier = require("../model/Supplier");
const Loan = require("../model/Loan");
const Product = require("../model/Product");
const Category = require("../model/Category");
const Unit = require("../model/Unit");
const ReceivedStock = require("../model/ReceivedStock");
const StockLedger =  require("../model/StockLedger");
const ParkingStore = require("../model/ParkingStore");
const ParkingStock = require("../model/ParkingStock");
const ParkingStockLedger = require("../model/ParkingStockLedger");
const Config = require('../model/NegSales');
const Notification = require('../model/Notification');
const StockAdjustment = require('../model/StockAdjustment');
const PriceAdjustment = require('../model/PriceAdjustment');
const TransferStock = require('../model/TransferStock');
const Expense = require('../model/Expense');
const ExpenseCategory = require('../model/ExpenseCategory');
const SupplierInvoice = require('../model/SupplierInvoice');
const SupplierLedger = require('../model/SupplierLedger');
const SalesLedger = require('../model/SalesLedger');
const Invoice = require('../model/Invoice');
const Transaction = require('../model/Transaction');
const ActionLog = require('../model/ActionLog');
const Role = require('../model/Role');
const Permission = require('../model/Permission');
const checkPermission = require("../Utils/checkPermission");
const ClosingAccount = require('../model/ClosingAccount');
router.use(require("../routes/query"))





// ROUTINGS 
router.get("/dashboard",  checkPermission("view-dashboard"), async (req, res) => {
  if (!req.user) return res.redirect("/");

  try {
    const user = await User.findById(req.user._id).populate("branch role");
    if (!user) return res.redirect("/");

    const branchId = user.branch?._id;
    const selectedBranchId = req.query.branchId || branchId;
    const sortFilter = req.query.sort;

    // Validate selectedBranchId
    if (!mongoose.Types.ObjectId.isValid(selectedBranchId)) {
      console.error("Invalid branch ID:", selectedBranchId);
      return res.status(400).send("Invalid branch ID");
    }

    let dateFilter = {};
    if (sortFilter === 'today') {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0); // Use UTC for consistency
      const end = new Date();
      end.setUTCHours(23, 59, 59, 999);
      dateFilter = { createdAt: { $gte: start, $lte: end } };
    } else if (sortFilter === 'last7days') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter = { createdAt: { $gte: lastWeek } };
    } else if (sortFilter === 'lastmonth') {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      dateFilter = { createdAt: { $gte: lastMonth } };
    }

    // Log dateFilter for debugging
    console.log("Date Filter:", dateFilter);

    const allBranches = await Branch.find();
    const branchDoc = allBranches.find(b => b._id.equals(selectedBranchId));

    const [
      totalCustomers,
      totalSuppliers,
      totalProducts,
      topCustomers,
      topCategories,
      recentPurchases,
      recentExpenses,
      totalSalesAmount,
      totalCashSales,
      totalCreditSales,
      totalExpensesAmount,
      totalStockValue,
      pendingInvoices,
      totalOrders,
      lowStockProducts,
      totalDebtRepayments,
      totalLoan,
      profitData,
      topSellingProductsRaw,
      recentSales
    ] = await Promise.all([
      Customer.countDocuments({ branch: selectedBranchId }),
      Supplier.countDocuments(),
      Product.countDocuments({ branch: selectedBranchId }),

      // Updated Top Customers query
      Customer.find({ branch: selectedBranchId, ...dateFilter })
        .sort({ sales_amount: -1, order_count: -1 }) // Sort by sales_amount, then order_count
        .limit(5),

      Category.find({ branch: selectedBranchId }).limit(5),

      SupplierInvoice.find({ branch: selectedBranchId, ...dateFilter }).sort({ createdAt: -1 }).limit(5),
      Expense.find({ branch: selectedBranchId, ...dateFilter }).sort({ createdAt: -1 }).limit(5),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$grand_total" } } }
      ]),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), sales_type: "cash", ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$grand_total" } } }
      ]),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), sales_type: "credit", ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$grand_total" } } }
      ]),

      Expense.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),

      Product.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId) } },
        { $group: { _id: null, total: { $sum: "$totalInBaseUnit" } } }
      ]),

      SupplierInvoice.find({ branch: selectedBranchId, status: "Pending" }).limit(5),

      Invoice.countDocuments({ branch: selectedBranchId, ...dateFilter }),

      Product.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId) } },
        { $unwind: "$variants" },
        { $match: { $expr: { $lt: ["$variants.quantity", "$variants.lowStockAlert"] } } },
        {
          $project: {
            product: 1,
            "variants.unitCode": 1,
            "variants.quantity": 1,
            "variants.lowStockAlert": 1
          }
        }
      ]),

      Transaction.aggregate([
        {
          $match: {
            branch: new mongoose.Types.ObjectId(selectedBranchId),
            transactionType: "Customer",
            ...dateFilter
          }
        },
        { $group: { _id: null, total: { $sum: "$amountReceived" } } }
      ]),

      Loan.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId) } },
        { $unwind: "$loans" },
        { $group: { _id: null, total: { $sum: "$loans.loanAmount" } } }
      ]),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), ...dateFilter } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "productInfo"
          }
        },
        { $unwind: "$productInfo" },
        {
          $project: {
            quantity: "$items.qty",
            sellPrice: "$items.rate",
            supplierPrice: "$productInfo.supplierPrice",
            profitPerItem: { $subtract: ["$items.rate", "$productInfo.supplierPrice"] }
          }
        },
        {
          $group: {
            _id: null,
            totalProfit: { $sum: { $multiply: ["$profitPerItem", "$quantity"] } }
          }
        }
      ]),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), ...dateFilter } },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              productId: "$items.product",
              unitCode: "$items.unitcode"
            },
            totalSold: { $sum: "$items.qty" },
            totalRevenue: { $sum: "$items.total" }
          }
        },
        {
          $lookup: {
            from: "products",
            localField: "_id.productId",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: "$product" },
        {
          $project: {
            productId: "$_id.productId",
            productName: "$product.product",
            unitCode: "$_id.unitCode",
            image: "$product.product_image",
            totalSold: 1,
            totalAmount: "$totalRevenue"
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 }
      ]),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), ...dateFilter } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "product"
          }
        },
        {
          $unwind: {
            path: "$product",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "categories",
            localField: "product.category",
            foreignField: "_id",
            as: "category"
          }
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "soldBy"
          }
        },
        {
          $unwind: {
            path: "$soldBy",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            product_name: "$product.product",
            product_image: "$product.product_image",
            category: "$category.name",
            qty: "$items.qty",
            unitCode: "$items.unitcode",
            total: "$items.total",
            soldBy: "$soldBy.username",
            createdAt: 1
          }
        }
      ])
    ]);

    // Log recentSales for debugging
    if (!recentSales.length) {
      console.log("No recent sales found for branch:", selectedBranchId, "with filter:", dateFilter);
    } else {
      console.log("Recent Sales:", JSON.stringify(recentSales, null, 2));
    }

    // Log topCustomers for debugging
    if (!topCustomers.length) {
      console.log("No top customers found for branch:", selectedBranchId, "with filter:", dateFilter);
    } else {
      console.log("Top Customers:", JSON.stringify(topCustomers, null, 2));
    }

    const dashboardData = {
      totalCustomers,
      totalSuppliers,
      totalProducts,
      topCustomers,
      topCategories,
      recentSales,
      recentPurchases,
      recentExpenses,
      totalSalesAmount: totalSalesAmount[0]?.total || 0,
      totalCashSales: totalCashSales[0]?.total || 0,
      totalCreditSales: totalCreditSales[0]?.total || 0,
      totalExpensesAmount: totalExpensesAmount[0]?.total || 0,
      totalStockValue: totalStockValue[0]?.total || 0,
      pendingInvoices,
      allBranches,
      selectedBranchId,
      totalOrders,
      lowStockProducts,
      totalDebtRepayments: totalDebtRepayments[0]?.total || 0,
      totalLoan: totalLoan[0]?.total || 0,
      profit: profitData[0]?.totalProfit || 0,
      topSellingProducts: topSellingProductsRaw
    };

    res.render("index", {
      user,
      dashboardData,
      branches: allBranches,
      currentSort: sortFilter,
      selectedBranchId,
      ownerBranch: { branch: branchDoc }
    });

  } catch (err) {
    console.error("Error loading dashboard:", err);
    res.status(500).send("Internal Server Error");
  }
});








// CUSTOMER ROUTE
router.get("/customer", checkPermission("view-customers"), async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const user = req.user; // from middleware
    const sortBy = req.query.sort || "today";
    const customerType = req.query.customerType || "all";

    const selectedBranchId =
      user.role.name.toLowerCase() === "owner"
        ? req.selectedBranchId
        : user.branch._id;

    // DATE FILTER
    let dateFilter = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (sortBy === "today") {
      dateFilter = { createdAt: { $gte: today } };
    } else if (sortBy === "last7days") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      dateFilter = { createdAt: { $gte: sevenDaysAgo } };
    } else if (sortBy === "lastMonth") {
      const lastMonth = new Date();
      lastMonth.setMonth(today.getMonth() - 1);
      dateFilter = { createdAt: { $gte: lastMonth } };
    }

    // CUSTOMER TYPE FILTER
    let typeFilter = {};
    if (customerType === "cash") {
      typeFilter = {
        $and: [
          { $or: [{ remaining_amount: { $exists: false } }, { remaining_amount: 0 }] },
          { $or: [{ total_debt: { $exists: false } }, { total_debt: 0 }] }
        ]
      };
    } else if (customerType === "credit") {
      typeFilter = {
        $or: [
          { remaining_amount: { $exists: true, $ne: 0 } },
          { total_debt: { $exists: true, $ne: 0 } }
        ]
      };
    }

    const filters = {
      branch: selectedBranchId,
      ...dateFilter,
      ...typeFilter
    };

    const customers = await Customer.find(filters).sort({ createdAt: -1, _id: -1 });

    // Determine ownerBranch document
    const ownerBranch =
      user.role.name.toLowerCase() === "owner"
        ? req.allBranches.find(b => b._id.equals(selectedBranchId))
        : user.branch;

    res.render("Customer/customer", {
      user,
      ownerBranch: { branch: ownerBranch },
      branches: user.role.name.toLowerCase() === "owner" ? req.allBranches : [user.branch],
      selectedBranchId,
      customers,
      selectedSort: sortBy,
      selectedCustomerType: customerType
    });
  } catch (err) {
    console.error("Error fetching customers:", err);
    res.redirect("/error-404");
  }
});




router.post("/addCustomers", (req, res) => {
  const { customer_name, mobile, email, address, credit_limit } = req.body;

  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  User.findById(req.user._id)
    .then(user => {
      if (!user) return res.redirect('/');

      const newCustomer = new Customer({
        customer_name,
        mobile,
        email,
        address,
        credit_limit,
        branch: user.branch
      });

      return newCustomer.save()
        .then(savedCustomer => {
          return Branch.findByIdAndUpdate(
            user.branch,
            { $push: { customers: savedCustomer._id } },
            { new: true }
          ).then(() => savedCustomer);
        });
    })
    .then(savedCustomer => {
      console.log("Customer saved and added to branch:", savedCustomer);
      res.redirect('/customer');
    })
    .catch(err => {
      console.error("Error adding customer:", err);
      res.status(500).send("Internal Server Error");
    });
});

router.post("/create-customer", (req, res) => {
  const { customer_name, mobile, address, credit_limit } = req.body;

  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  User.findById(req.user._id)
    .then(user => {
      if (!user) return res.redirect('/');

      const newCustomer = new Customer({
        customer_name,
        mobile,
        address,
        credit_limit,
        branch: user.branch
      });

      return newCustomer.save()
        .then(savedCustomer => {
          return Branch.findByIdAndUpdate(
            user.branch,
            { $push: { customers: savedCustomer._id } },
            { new: true }
          ).then(() => savedCustomer);
        });
    })
    .then(savedCustomer => {
      console.log("Customer saved and added to branch:", savedCustomer);
      res.redirect('/createSales');
    })
    .catch(err => {
      console.error("Error adding customer:", err);
      res.status(500).send("Internal Server Error");
    });
});

router.get("/delete/customer/:id", async (req, res) => {
  try {
    // Find the customer first (for particulars)
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).send("Customer not found");
    }

    
    await Customer.findByIdAndDelete(req.params.id);

    await ActionLog.create({
      action: "delete",
      operator: req.user._id,
      branch: req.user.branch,
      particulars: `Deleted customer: ${customer.customer_name}`,
      targetModel: "Customer",
      targetId: customer._id
    });

    res.redirect("/customer");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/update/customer/:id", async (req, res) => {
  try {
    const customerId = req.params.id;
    const updates = req.body;

    const existingCustomer = await Customer.findById(customerId);
    if (!existingCustomer) {
      return res.status(404).send("Customer not found");
    }

    let updatedFields = {};
    let hasChanges = false;

    // Compare each field
    for (let key in updates) {
      if (
        updates[key] !== undefined &&
        updates[key] !== existingCustomer[key]?.toString()
      ) {
        updatedFields[key] = updates[key];
        hasChanges = true;
      }
    }
    if (hasChanges) {
      await Customer.findByIdAndUpdate(customerId, updatedFields, { new: true });
      console.log("Updated customer:", updatedFields);
    } else {
      console.log("No changes detected.");
    }

    res.redirect("/customer"); // or res.json({ success: true }) if using AJAX
  } catch (error) {
    next(error);
  }
});
// CUSTOMER ROUTE END 


// SUPPLIER ROUTE 
router.get("/supplier", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      if (user.role === 'owner') {
        Branch.find()
          .then(allBranches => {
            const branchToFilter = selectedBranchId || user.branch._id;

            Supplier.find({})
              .then(suppliers => {
                res.render("Supplier/suppliers", {
                  user,
                  ownerBranch: { branch: user.branch },
                  branches: allBranches,
                  selectedBranchId: branchToFilter,
                  suppliers
                });
              })
              .catch(err => {
                console.error("Error fetching customers:", err);
                res.redirect("/error-404");
              });
          });
      } else {
        // Staff/Admin logic - show only their own branch
        Supplier.find({})
          .then(suppliers => {
            res.render("Supplier/suppliers", {
              user,
              ownerBranch: { branch: user.branch },
              branches: [user.branch],
              selectedBranchId: user.branch._id,
              suppliers
            });
          })
          .catch(err => {
            console.error("Error fetching customers:", err);
            res.redirect("/error-404");
          });
      }
    })
    .catch(err => {
      console.error("Error fetching user:", err);
      res.redirect("/error-404");
    });
});

router.post("/addSupplier", (req, res, next) => {
    const { supplier, contact_person, email, phone, address } = req.body;
    const newSupplier = new Supplier({
      supplier,
      contact_person,
      email,
      phone,
      address
    });
  
    newSupplier.save()
      .then(savedSupplier => {
        res.redirect("/supplier");
      })
      .catch(err => {
        next(err);
      });
});

router.get("/delete/supplier/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).send("Supplier not found");
    }

    await Supplier.findByIdAndDelete(req.params.id);

    await ActionLog.create({
      action: "delete",
      operator: req.user._id,
      branch: req.user.branch,
      particulars: `Deleted supplier: ${supplier.supplier}`,
      targetModel: "Supplier",
      targetId: supplier._id
    });

    res.redirect("/supplier");

  } catch (err) {
    console.error("Error deleting supplier:", err);
    res.status(500).send("Server error");
  }
});


router.post("/update/supplier/:id", async (req, res, next) => {
  try {
    const supplierId = req.params.id;
    const updates = req.body;

    const existingSupplier = await Supplier.findById(supplierId);
    if (!existingSupplier) {
      return res.status(404).send("Supplier not found");
    }

    let changedFields = {};
    for (let key in updates) {
      if (
        updates[key] !== undefined &&
        updates[key] !== existingSupplier[key]?.toString()
      ) {
        changedFields[key] = updates[key];
      }
    }

    if (Object.keys(changedFields).length > 0) {
      await Supplier.findByIdAndUpdate(supplierId, changedFields);
    }

    res.redirect("/supplier");
  } catch (error) {
    next(error);
  }
});


router.get(
  "/SuppliersInvoice",
  checkPermission("view-supplier-invoices"),
  async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.redirect("/");

      const user = req.user; // from middleware
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      // Fetch suppliers and invoices for the selected branch
      const [suppliers, invoices] = await Promise.all([
        Supplier.find(),
        SupplierInvoice.find({ branch: selectedBranchId }).populate("supplier")
      ]);

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );

        return res.render("Supplier/supplierInvoice", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          suppliers,
          invoices
        });
      } else {
        return res.render("Supplier/supplierInvoice", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          suppliers,
          invoices
        });
      }
    } catch (err) {
      console.error("Error loading supplier invoices:", err);
      return res.redirect("/error-404");
    }
  }
);

router.post(
  '/addinvoiceSuppliers',
  checkPermission("modify-supplier-invoice"),
  async (req, res) => {
    try {
      const user = req.user; // already populated by middleware
      if (!user || !user.branch) {
        return res.status(400).send('User or user branch not found.');
      }

      const {
        supplier,
        invoice_type, // 'debit' or 'credit'
        amount,
        payment_date,
        reason
      } = req.body;

      const amt = Number(amount);

      // Save invoice
      const newInvoice = new SupplierInvoice({
        supplier,
        branch: user.branch,
        invoice_type,
        amount: amt,
        payment_date,
        reason,
        created_by: user._id
      });
      const savedInvoice = await newInvoice.save();

      await Supplier.findByIdAndUpdate(
        supplier,
        { $push: { supplierInvoice: savedInvoice._id } }
      );

      await Branch.findByIdAndUpdate(
        user.branch,
        { $push: { supplier_invoice: savedInvoice._id } }
      );

      // Get last ledger entry to compute running balance
      const lastLedger = await SupplierLedger.findOne({
        supplier,
        branch: user.branch
      }).sort({ createdAt: -1 });

      const prevBalance = lastLedger ? lastLedger.Balance : 0;

      let newBalance;
      let ledgerAmount = 0;
      let ledgerPaid = 0;

      if (invoice_type === 'debit') {
        // Debit: increase debt
        newBalance = prevBalance + amt;
        ledgerAmount = amt;
      } else if (invoice_type === 'credit') {
        // Credit: decrease debt
        newBalance = prevBalance - amt;
        ledgerPaid = amt;
      } else {
        return res.status(400).send('Invalid invoice type.');
      }

      const ledgerEntry = new SupplierLedger({
        supplier,
        branch: user.branch,
        type: invoice_type,
        refNo: reason,
        date: new Date(payment_date),
        amount: ledgerAmount,
        paid: ledgerPaid,
        Balance: newBalance
      });

      await ledgerEntry.save();

      return res.redirect('/SuppliersInvoice');
    } catch (err) {
      console.error('Error processing supplier invoice:', err);
      res.status(500).send('Internal Server Error');
    }
  }
);





router.post('/editInvoiceSuppliers', async (req, res) => {
  try {
    const { invoiceId, supplier, invoice_type, amount, payment_date, reason } = req.body;

    const amt = Number(amount);
    const newDate = new Date(payment_date);

    await SupplierInvoice.updateOne(
      { _id: invoiceId },
      { supplier, invoice_type, amount: amt, payment_date: newDate, reason }
    );

    const updatedInvoice = await SupplierInvoice.findById(invoiceId)
    .populate('supplier', 'supplier');

    const ledgerEntry = await SupplierLedger.findOne({ refNo: reason, supplier });
    if (!ledgerEntry) return res.status(404).send('Ledger entry not found');

    ledgerEntry.type = invoice_type;
    ledgerEntry.date = newDate;
    ledgerEntry.amount = invoice_type === 'debit' ? amt : 0;
    ledgerEntry.paid = invoice_type === 'credit' ? amt : 0;

    await ledgerEntry.save();

    // 4️⃣ Recalculate balances from all entries, sorted chronologically
    const branch = ledgerEntry.branch;
    const allEntries = await SupplierLedger.find({ supplier, branch }).sort({ date: 1, createdAt: 1 });

    let runningBalance = 0;
    for (const entry of allEntries) {
      const isCredit = entry.type.startsWith('credit');
      const isDebit = entry.type.startsWith('debit');

      if (isDebit) {
        runningBalance += entry.amount;
      } else if (isCredit) {
        runningBalance -= entry.paid;
      }

      entry.Balance = runningBalance;
      await entry.save();
    }

     
    await ActionLog.create({
      action: "edit",
      operator: req.user._id,
      branch: req.user.branch,
      particulars: `Edited supplier invoice  for ${updatedInvoice.supplier.supplier}, new type: ${invoice_type}, amount: ${amt}, date: ${newDate.toLocaleDateString()}`,
      targetModel: "SupplierInvoice",
      targetId: invoiceId
    });

    return res.redirect('/SuppliersInvoice');

  } catch (err) {
    console.error('Edit failed:', err);
    res.status(500).send('Edit failed');
  }
});




router.post('/deleteInvoiceSupplier', async (req, res) => {
  try {
    const invoice = await SupplierInvoice.findById(req.body.invoiceId)
    .populate('supplier', 'supplier');

    if (!invoice) {
      return res.status(404).send('Invoice not found.');
    }

    await SupplierInvoice.findByIdAndDelete(req.body.invoiceId);

    await ActionLog.create({
      action: "delete",
      operator: req.user._id,
      branch: req.user.branch,
      particulars: `Deleted supplier invoice for supplier: ${invoice.supplier.supplier}, type: ${invoice.invoice_type}, amount: ${invoice.amount}`,
      targetModel: "SupplierInvoice",
      targetId: invoice._id
    });

    res.redirect('/SuppliersInvoice');
  } catch (err) {
    console.error('Delete failed:', err);
    res.status(500).send('Failed to delete invoice.');
  }
});

// SUPPLIER ROUTE ENDS HERE 

// LOAN ROUTE 
router.get("/loan", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) return res.redirect("/");

    const selectedBranchId = req.query.branchId;
    const user = await User.findById(req.user._id).populate("branch");

    if (!user) return res.redirect("/");

    let branches = [];
    let branchToFilter;
    let loans;

    if (user.role === "owner") {
      branches = await Branch.find();
      branchToFilter = selectedBranchId || user.branch._id;
    } else {
      branches = [user.branch];
      branchToFilter = user.branch._id;
    }

    loans = await Loan.find({ branch: branchToFilter });

    res.render("Loan/loan", {
      user,
      ownerBranch: { branch: user.branch },
      branches,
      selectedBranchId: branchToFilter,
      loan: loans
    });

  } catch (err) {
    console.error("Error in /loan route:", err);
    res.redirect("/error-404");
  }
});

router.post("/update/loaner/:id", async (req, res, next) => {
  try {
    const loanerId = req.params.id;
    const updates = req.body;

    const existingLoaner = await Loan.findById(loanerId);
    if (!existingLoaner) {
      return res.status(404).send("Loaner not found");
    }

    let updatedFields = {};
    let hasChanges = false;

    // Only update fields that actually changed
    for (let key in updates) {
      if (
        updates[key] !== undefined &&
        updates[key] !== existingLoaner[key]?.toString()
      ) {
        updatedFields[key] = updates[key];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await Loan.findByIdAndUpdate(loanerId, updatedFields);

      // ✅ Log the update
      await ActionLog.create({
        action: "edit",
        operator: req.user._id,
        branch: req.user.branch,
        particulars: `Edited loaner: ${existingLoaner.loaner}, changes: ${JSON.stringify(updatedFields)}`,
        targetModel: "Loan",
        targetId: loanerId
      });

      console.log("Loaner updated:", updatedFields);
    } else {
      console.log("No changes detected for loaner update.");
    }

    res.redirect("/loan"); // Redirect back to loan list

  } catch (error) {
    console.error("Error updating loaner:", error);
    next(error); // Pass error to global handler
  }
});


router.get("/delete/loaner/:id", async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).send("Loan not found");
    }

    await Loan.findByIdAndDelete(req.params.id);

    await ActionLog.create({
      action: "delete",
      operator: req.user._id,
      branch: req.user.branch,
      particulars: `Deleted loaner: ${loan.loaner}, mobile: ${loan.mobile}`,
      targetModel: "Loan",
      targetId: loan._id
    });

    res.redirect("/loan");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});



router.post("/addLoaner", async (req, res, next) => {
  try {
    const { loaner, mobile, address } = req.body;

    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.redirect("/");
    }

    const newLoaner = new Loan({
      loaner,
      mobile,
      address,
      branch: user.branch,
      loans: []
    });

    const savedLoaner = await newLoaner.save();
    console.log("New loaner saved:", savedLoaner);

    res.redirect("/loan");
  } catch (err) {
    console.error("Error adding loaner:", err);
    next(err); // Pass error to global error handler
  }
});


router.get(
  "/manageLoan",
  checkPermission("view-loans"),
  async (req, res) => {
    try {
      const user = req.user; // from middleware
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      // Determine ownerBranch document
      const ownerBranch =
        user.role.name.toLowerCase() === "owner"
          ? req.allBranches.find(b => b._id.equals(selectedBranchId))
          : user.branch;

      // Fetch loaners (no branch filter here if Loan is global)
      const loaners = await Loan.find();

      res.render("Loan/manageLoan", {
        user,
        ownerBranch: { branch: ownerBranch },
        branches: user.role.name.toLowerCase() === "owner" ? req.allBranches : [user.branch],
        selectedBranchId,
        loaners
      });
    } catch (err) {
      console.error("Error in /manageLoan route:", err);
      res.redirect("/error-404");
    }
  }
);



router.get('/searchLoaner', async (req, res) => {
  const q = req.query.q || '';
  const branchId = req.user.branch; // adjust if using session/passport

  try {
    const results = await Loan.find({
      loaner: { $regex: `^${q}`, $options: 'i' },
      branch: branchId,
    })
    .limit(10)
    .select('_id loaner mobile address'); // only return needed fields

    // Return only distinct loaners (in case multiple loans exist)
    const uniqueLoaners = results.reduce((acc, curr) => {
      if (!acc.some(item => item.loaner === curr.loaner && item.mobile === curr.mobile)) {
        acc.push(curr);
      }
      return acc;
    }, []);

    res.json(uniqueLoaners);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post("/addLoan", (req, res) => {
  const { loanerId, loanAmount, loanContractDate, loanContractEndDate, details } = req.body;

  Loan.findById(loanerId)
    .then(loaner => {
      if (!loaner) return res.status(404).send("Loaner not found");

      loaner.loans.push({
        loanAmount,
        amount_to_repay: loanAmount,
        loanContractDate,
        loanContractEndDate,
        details
      });

      return loaner.save();
    })
    .then(() => {
      res.redirect("/manageLoan");
    })
    .catch(err => {
      console.error("Error adding loan:", err);
      res.status(500).send("Server error");
    });
});

router.post('/updateLoan/:loanId', async (req, res) => {
  const { loanId } = req.params;
  const { loanAmount, loanContractDate, loanContractEndDate, details } = req.body;

  try {
    const loan = await Loan.findOneAndUpdate(
      { 'loans._id': loanId },
      {
        $set: {
          'loans.$.loanAmount': loanAmount,
          'loans.$.loanContractDate': loanContractDate,
          'loans.$.loanContractEndDate': loanContractEndDate,
          'loans.$.details': details
        }
      },
      { new: true }
    );

    if (loan) {
      const updatedLoan = loan.loans.id(loanId);

      await ActionLog.create({
        action: "edit",
        operator: req.user._id,
        branch: req.user.branch,
        particulars: `Updated loan for loaner: ${loan.loaner}, 
                      Amount: ${loanAmount}, 
                      Start: ${loanContractDate}, 
                      End: ${loanContractEndDate}, 
                      Details: ${details}`,
        targetModel: "Loan",
        targetId: loanId
      });

      console.log(`Loan updated for ${loan.loaner}:`, updatedLoan);
    }

    res.redirect('/manageLoan');
  } catch (err) {
    console.error("Loan update failed:", err);
    res.status(500).send("Failed to update loan");
  }
});


router.delete('/deleteLoan/:loanId', async (req, res) => {
  const { loanId } = req.params;

  try {
    const loanerDoc = await Loan.findOne({ 'loans._id': loanId });
    if (!loanerDoc) {
      return res.status(404).send("Loan not found");
    }

    const loanToDelete = loanerDoc.loans.id(loanId);

    // Delete the loan
    await Loan.updateOne(
      { 'loans._id': loanId },
      { $pull: { loans: { _id: loanId } } }
    );

    await ActionLog.create({
      action: "delete",
      operator: req.user._id,
      branch: req.user.branch,
      particulars: `Deleted loan for loaner: ${loanerDoc.loaner}, 
                    Amount: ${loanToDelete.loanAmount}, 
                    Start: ${loanToDelete.loanContractDate}, 
                    End: ${loanToDelete.loanContractEndDate}`,
      targetModel: "Loan",
      targetId: loanId
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Delete loan failed:", err);
    res.sendStatus(500);
  }
});



// LOAN ROUTE ENDS HERE 

// STOCK ROUTE
router.get(
  "/addProduct",
  checkPermission("add-stock"),
  (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    User.findById(req.user._id)
      .populate("branch")
      .populate("role") // Ensure role is populated so we can access role.name
      .then(user => {
        if (!user) return res.redirect("/");

        if (user.role.name === 'owner') {
          Branch.findById(user.branch)
            .then(ownerBranch => {
              Branch.find()
                .then(allBranches => {
                  Supplier.find()
                    .then(suppliers => {
                      Category.find()
                        .then(categories => {
                          Unit.find()
                            .then(units => {
                              res.render("Product/addProduct", {
                                user,
                                ownerBranch: { branch: ownerBranch },
                                branches: allBranches, // ✅ Always pass branches
                                suppliers,
                                categories,
                                units
                              });
                            });
                        });
                    })
                    .catch(err => {
                      console.error("Error fetching suppliers or categories:", err);
                      res.redirect("/error-404");
                    });
                });
            })
            .catch(err => {
              console.error(err);
              res.redirect("/error-404");
            });
        } else {
          Supplier.find()
            .then(suppliers => {
              Category.find()
                .then(categories => {
                  Unit.find()
                    .then(units => {
                      res.render("Product/addProduct", {
                        user,
                        ownerBranch: { branch: user.branch },
                        branches: [user.branch], // ✅ Provide single branch array
                        suppliers,
                        categories,
                        units
                      });
                    });
                });
            });
        }
      })
      .catch(err => {
        console.error(err);
        res.redirect("/error-404");
      });
  }
);


router.get(
  "/manageProduct",
  checkPermission("manage-stock"),
  async (req, res) => {
    try {
      const user = req.user;
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      const units = await Unit.find();

      const products = await Product.find({
        branch: selectedBranchId,
        status: "active"
      })
        .populate("category")
        .populate("branch")
        .populate("variants.supplier");

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );

        return res.render("Product/manageProduct", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          products,
          units
        });
      } else {
        return res.render("Product/manageProduct", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          products,
          units
        });
      }
    } catch (err) {
      console.error("Error loading manageProduct:", err);
      res.redirect("/error-404");
    }
  }
);




router.get("/check-product-name", async (req, res) => {
  try {
    const name = req.query.name?.trim();
    if (!name) return res.json({ exists: false, similarNames: [] });

    const regex = new RegExp(name, "i");

    // Ensure user is authenticated and branch is available
    const branchId = req.user?.branch;
    if (!branchId) return res.status(400).json({ error: "Branch not found" });

    const products = await Product.find({
      product: regex,
      branch: branchId // 🔐 Filter by logged-in branch
    }).limit(10).select("product");

    const exists = products.some(p => p.product.toLowerCase() === name.toLowerCase());
    const similarNames = products.map(p => p.product);

    res.json({ exists, similarNames });
  } catch (err) {
    console.error("Product name check failed:", err);
    res.status(500).json({ exists: false, similarNames: [] });
  }
});


router.post("/addProduct", upload.single("product_image"), (req, res, next) => {
  const {
    product,
    category,
    branch,
    product_detail,
    mfgDate,
    expDate,
    quantity,
    unitCode,
    lowStockAlert,
    supplierPrice,
    sellPrice
  } = req.body;

  const quantities = Array.isArray(quantity) ? quantity.map(Number) : [Number(quantity)];
  const unitCodes = Array.isArray(unitCode) ? unitCode : [unitCode];
  const lowStockAlerts = Array.isArray(lowStockAlert) ? lowStockAlert.map(Number) : [Number(lowStockAlert)];
  const sellPrices = Array.isArray(sellPrice) ? sellPrice.map(Number) : [Number(sellPrice)];
  const supplierPriceNum = Number(supplierPrice);
  const totalWorth = quantities[0] * supplierPriceNum;

  const variants = [];

  variants.push({
    quantity: quantities[0],
    unitCode: unitCodes[0],
    lowStockAlert: lowStockAlerts[0],
    sellPrice: sellPrices[0],
    totalWorth,
    totalPotentialRevenue: quantities[0] * sellPrices[0],
    actualRevenue: 0
  });

  for (let i = 1; i < quantities.length; i++) {
    const qty = quantities[i];
    const baseQty = quantities[0] * qty;
    const revenue = baseQty * sellPrices[i];

    variants.push({
      quantity: baseQty,
      unitCode: unitCodes[i],
      lowStockAlert: lowStockAlerts[i],
      sellPrice: sellPrices[i],
      totalInBaseUnit: qty,
      totalWorth: baseQty * supplierPriceNum,
      totalPotentialRevenue: revenue,
      actualRevenue: 0
    });
  }

  Product.findOne({ product, branch })
    .then(existingProduct => {
      if (existingProduct) {
        return next(new Error("Product name already exists for this branch."));
      }

      const newProduct = new Product({
        product,
        category,
        product_detail,
        mfgDate,
        expDate,
        branch,
        product_image: req.file ? req.file.filename : null,
        supplierPrice: supplierPriceNum,
        variants
      });

      return newProduct.save();
    })
    .then(savedProduct => {
      if (!savedProduct) return;

      return Branch.findByIdAndUpdate(
        branch,
        { $addToSet: { stock: savedProduct._id } },
        { new: true }
      );
    })
    .then(updatedBranch => {
      if (updatedBranch) {
        res.redirect("/manageProduct");
      }
    })
    .catch(err => {
      next(err);
    });
});


router.get("/product-details/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const product = await Product.findById(req.params.id)
      .populate("category")
      .populate("branch")
      .populate("variants.supplier");

    if (!product) {
      req.flash("error", "Product not found.");
      return res.redirect("back");
    }

    res.render("Product/product-details", {
      user: req.user,
      product
    });
  } catch (err) {
    console.error("Error fetching product:", err);
    res.redirect("/error-404");
  }
});


router.get(
  '/edit-product/:id',
  checkPermission('edit-stock'),
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');

    try {
      const user = await User.findById(req.user._id)
        .populate('branch')
        .populate('role'); // ✅ so we can check role.name

      const product = await Product.findById(req.params.id)
        .populate('category')
        .populate('branch')
        .populate('variants.supplier');

      if (!product) return res.redirect('/error-404');

      // ✅ Only allow owner or same-branch staff
      if (user.role.name.toLowerCase() !== 'owner' && !product.branch._id.equals(user.branch._id)) {
        return res.redirect('/unauthorized');
      }

      const categories = await Category.find();
      const units = await Unit.find();

      res.render('Product/editProduct', {
        user,
        product,
        categories,
        units,
        branches: user.role.name.toLowerCase() === 'owner'
          ? await Branch.find() // owners can pick any branch in header
          : [user.branch]        // non-owners only their branch
      });
    } catch (err) {
      console.error('Edit product error:', err);
      res.redirect('/error-404');
    }
  }
);



router.post('/editProduct/:id', upload.single('product_image'), async (req, res, next) => {
  try {
    const productId = req.params.id;
    const {
      product,
      category,
      product_detail,
      mfgDate,
      expDate
    } = req.body;

    const productDoc = await Product.findById(productId);
    if (!productDoc) return res.status(404).send('Product not found');

    let productModified = false;

    // Update only allowed fields
    if (product && product !== productDoc.product) {
      productDoc.product = product;
      productModified = true;
    }

    if (category && category !== productDoc.category.toString()) {
      productDoc.category = category;
      productModified = true;
    }

    if (product_detail && product_detail !== productDoc.product_detail) {
      productDoc.product_detail = product_detail;
      productModified = true;
    }

    if (mfgDate && (!productDoc.mfgDate || new Date(mfgDate).toISOString() !== productDoc.mfgDate.toISOString())) {
      productDoc.mfgDate = new Date(mfgDate);
      productModified = true;
    }

    if (expDate && (!productDoc.expDate || new Date(expDate).toISOString() !== productDoc.expDate.toISOString())) {
      productDoc.expDate = new Date(expDate);
      productModified = true;
    }

    if (req.file) {
      productDoc.product_image = req.file.filename;
      productModified = true;
    }

    if (productModified) {
      await productDoc.save();
    }

    res.redirect('/manageProduct');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post(
  '/delete-product/:id',
  checkPermission('delete-stock'),
  async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.redirect('/');

      const user = await User.findById(req.user._id)
        .populate('branch')
        .populate('role');

      const productId = req.params.id;
      const productDoc = await Product.findById(productId).populate('branch');

      if (!productDoc) return res.status(404).send('Product not found');

      if (
        user.role.name.toLowerCase() !== 'owner' &&
        !productDoc.branch._id.equals(user.branch._id)
      ) {
        return res.redirect('/unauthorized');
      }

      const branchId = productDoc.branch._id;
      const operator = req.user?._id || null;

      await Product.findByIdAndUpdate(productId, {
        $set: { status: 'deleted' }
      });

      await StockLedger.updateMany(
        { product: productId, branch: branchId },
        {
          $set: {
            status: 'deleted',
            particular: 'Stock deleted - record closed',
            date: new Date(),
            operator
          }
        }
      );

      await ParkingStockLedger.updateMany(
        { product: productId, branch: branchId },
        {
          $set: {
            status: 'deleted',
            particular: 'Stock deleted - record closed',
            date: new Date(),
            operator
          }
        }
      );

      await ParkingStock.deleteMany({ product: productId, branch: branchId });

      await ActionLog.create({
        action: "delete",
        operator: operator,
        branch: branchId,
        particulars: `Deleted product: ${productDoc.product} from branch: ${productDoc.branch.branch_name}`,
        targetModel: "Product",
        targetId: productId
      });

      res.redirect('/manageProduct');
    } catch (err) {
      console.error('Error deleting product and related records:', err);
      res.status(500).send('Failed to delete product and related data');
    }
  }
);



router.get(
  "/adjustStock",
  checkPermission("adjust-stock"),
  async (req, res) => {
    try {
      const user = req.user;
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      const currentSort = req.query.sort;
      const units = await Unit.find();

      let sortOption = { createdAt: -1 };
      if (currentSort === "ascending") sortOption = { createdAt: 1 };
      else if (currentSort === "descending") sortOption = { createdAt: -1 };

      const products = await Product.find({ branch: selectedBranchId })
        .populate("category")
        .populate("branch");

      let adjustmentsQuery = StockAdjustment.find().where(
        "product"
      ).in(products.map(p => p._id));

      if (currentSort === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        adjustmentsQuery = adjustmentsQuery.where("createdAt").gte(today);
      } else if (currentSort === "lastMonth") {
        const now = new Date();
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        adjustmentsQuery = adjustmentsQuery.where("createdAt")
          .gte(firstDayLastMonth)
          .lte(lastDayLastMonth);
      } else if (currentSort === "last7days") {
        const last7days = new Date();
        last7days.setDate(last7days.getDate() - 7);
        adjustmentsQuery = adjustmentsQuery.where("createdAt").gte(last7days);
      }

      const adjustments = await adjustmentsQuery
        .populate("adjustedBy")
        .populate("product")
        .sort(sortOption)
        .limit(20);

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );

        return res.render("Product/stock-adjustment", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          products,
          units,
          adjustments,
          currentSort
        });
      } else {
        return res.render("Product/stock-adjustment", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          products,
          units,
          adjustments,
          currentSort
        });
      }
    } catch (err) {
      console.error("Error loading adjustStock page:", err);
      res.redirect("/error-404");
    }
  }
);




router.post(
  '/delete-stock-adjustment/:id',
  checkPermission('stock-adjustment'),
  async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.redirect('/');

      const user = await User.findById(req.user._id)
        .populate('branch')
        .populate('role');

      if (!user) return res.redirect('/');

      const adjustment = await StockAdjustment.findById(req.params.id)
        .populate({
          path: 'product',
          populate: { path: 'branch' }
        });

      if (!adjustment) return res.status(404).send('Adjustment not found');

      if (
        user.role.name.toLowerCase() !== 'owner' &&
        !adjustment.product.branch._id.equals(user.branch._id)
      ) {
        return res.redirect('/unauthorized');
      }

      await StockAdjustment.findByIdAndDelete(req.params.id);

      await ActionLog.create({
        action: "delete",
        operator: req.user?._id || null,
        branch: adjustment.product.branch._id,
        particulars: `Deleted stock adjustment for product: ${adjustment.product.product} in branch: ${adjustment.product.branch.branch_name}`,
        targetModel: "StockAdjustment",
        targetId: req.params.id
      });

      res.redirect('/adjustStock');
    } catch (err) {
      console.error('Error deleting adjustment:', err);
      next(err);
    }
  }
);



// router.get('/search-product', async (req, res) => {
//   const q = req.query.q.toLowerCase();
//   const products = await Product.find({ product: { $regex: q, $options: 'i' } }).select('product _id');
//   res.json(products);
// });

router.get('/get-product/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.json(product);
});


router.post(
  '/adjust-stock',
  checkPermission('stock-adjustment'),
  async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.redirect('/');

      const { product, unitCode, adjustQty, adjustmentType, notes } = req.body;
      const user = await User.findById(req.user._id)
        .populate('branch')
        .populate('role');

      if (!user) return res.redirect('/');
      if (!product || !unitCode || !adjustQty || !adjustmentType) {
        return res.status(400).send('Missing required fields.');
      }

      const adjustNum = parseFloat(adjustQty);
      if (isNaN(adjustNum) || adjustNum <= 0) {
        return res.status(400).send('Invalid adjustQty.');
      }

      const prod = await Product.findById(product).populate('branch');
      if (!prod) return res.status(404).send('Product not found');

      if (
        user.role.name.toLowerCase() !== 'owner' &&
        !prod.branch._id.equals(user.branch._id)
      ) {
        return res.redirect('/unauthorized');
      }

      const variants = prod.variants || [];
      const selectedUnitCode = Array.isArray(unitCode) ? unitCode[0] : unitCode;

      const targetVariant = variants.find(
        v =>
          (v.unitCode || '').trim().toUpperCase() ===
          (selectedUnitCode || '').trim().toUpperCase()
      );
      if (!targetVariant)
        return res.status(404).send(`Variant not found: ${selectedUnitCode}`);

      if (adjustmentType === 'increase') {
        targetVariant.quantity += adjustNum;
      } else if (adjustmentType === 'decrease') {
        targetVariant.quantity = Math.max(
          0,
          targetVariant.quantity - adjustNum
        );
      } else {
        return res.status(400).send('Invalid adjustmentType');
      }

      const newBaseQty = !targetVariant.totalInBaseUnit
        ? targetVariant.quantity
        : targetVariant.quantity / targetVariant.totalInBaseUnit;

      for (const v of variants) {
        v.quantity = !v.totalInBaseUnit
          ? newBaseQty
          : newBaseQty * v.totalInBaseUnit;
      }

      await prod.save();

      const branch = prod.branch;
      const prefix = branch.branch_name.toUpperCase().slice(0, 2);
      const stockPrefix = `ADJ-${prefix}-`;

      const latestLedger = await StockLedger.findOne({
        stock_ID: { $regex: `^${stockPrefix}` }
      })
        .sort({ createdAt: -1 })
        .lean();

      const nextNumber = latestLedger?.stock_ID?.match(/\d+$/)
        ? parseInt(latestLedger.stock_ID.match(/\d+$/)[0]) + 1
        : 1;

      const generatedStockID = `${stockPrefix}${String(nextNumber).padStart(
        3,
        '0'
      )}`;

      await StockLedger.create({
        date: new Date(),
        product: prod._id,
        branch: branch._id,
        operator: user._id,
        particular: 'Adjustment',
        stock_ID: generatedStockID,
        customer: notes || '',
        variants: variants.map(v => ({
          unitCode: v.unitCode,
          stock_in:
            adjustmentType === 'increase' &&
            v.unitCode === selectedUnitCode
              ? adjustNum
              : 0,
          stock_out:
            adjustmentType === 'decrease' &&
            v.unitCode === selectedUnitCode
              ? adjustNum
              : 0,
          balance: v.quantity
        })),
        notes: notes || ''
      });

      await StockAdjustment.create({
        product: prod._id,
        adjustedBy: user._id,
        notes,
        variants: [
          {
            unitCode: selectedUnitCode,
            adjustmentType,
            quantity: adjustNum
          }
        ]
      });

        await ActionLog.create({
        action: "edit",
        operator: user._id,
        branch: branch._id,
        particulars: `Stock ${adjustmentType} of ${adjustNum} ${selectedUnitCode} for product "${prod.product}" in "${branch.branch_name}" branch`,
        targetModel: "Product",
        targetId: prod._id
      });

      res.redirect('/adjustStock');
    } catch (err) {
      console.error('❌ Error adjusting stock:', err);
      next(err);
    }
  }
);




router.get(
  "/price-adjustments",
  checkPermission("view-price-adjustments"),
  async (req, res) => {
    try {
      const user = req.user;
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      const units = await Unit.find();

      const products = await Product.find({ branch: selectedBranchId })
        .populate("category")
        .populate("branch");

      const adjustments = await PriceAdjustment.find({
        product: { $in: products.map(p => p._id) }
      })
        .populate("product")
        .populate("adjustedBy")
        .sort({ createdAt: -1 });

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );

        return res.render("Product/price-adjustment", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          products,
          adjustments,
          units
        });
      } else {
        return res.render("Product/price-adjustment", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          products,
          adjustments,
          units
        });
      }
    } catch (err) {
      console.error("Error loading price adjustment page:", err);
      res.redirect("/error-404");
    }
  }
);


router.post(
  '/adjust-price',
  checkPermission('price-adjustment'),
  async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.redirect('/');

      const { product, unitCode, adjustPrice, notes } = req.body;
      const operator = req.user?._id;

      if (!product || !unitCode || !adjustPrice || !operator) {
        return res.status(400).send('Missing required fields.');
      }

      const newPrice = parseFloat(adjustPrice);
      if (isNaN(newPrice) || newPrice <= 0) {
        return res.status(400).send('Invalid adjustPrice.');
      }

      const user = await User.findById(req.user._id)
        .populate('branch')
        .populate('role');
      if (!user) return res.redirect('/');

      const prod = await Product.findById(product).populate('branch');
      if (!prod) return res.status(404).send('Product not found');

      // ✅ Restrict branch-level actions
      if (
        user.role.name.toLowerCase() !== 'owner' &&
        !prod.branch._id.equals(user.branch._id)
      ) {
        return res.redirect('/unauthorized');
      }

      const variants = prod.variants || [];
      const selectedUnitCode = Array.isArray(unitCode) ? unitCode[0] : unitCode;

      const variant = variants.find(v => v.unitCode === selectedUnitCode);
      if (!variant) return res.status(404).send('Variant not found');

      const oldPrice = variant.sellPrice || 0;
      variant.sellPrice = newPrice;

      await prod.save();

      await PriceAdjustment.create({
        product: prod._id,
        adjustedBy: operator,
        notes,
        variants: [
          {
            unitCode: selectedUnitCode,
            oldPrice,
            newPrice
          }
        ]
      });

        await ActionLog.create({
        action: 'edit',
        operator: operator,
        branch: prod.branch._id,
        particulars: `Price adjusted for ${prod.product} (${selectedUnitCode}) from ${oldPrice} to ${newPrice}. Notes: ${notes || 'N/A'}`,
        targetModel: 'Product',
        targetId: prod._id
      });

      res.redirect('/price-adjustments');
    } catch (err) {
      console.error('Error adjusting price:', err);
      next(err);
    }
  }
);


router.post(
  '/delete-price-adjustment/:id',
  checkPermission('price-adjustment'),
  async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.redirect('/');

      const adjustmentId = req.params.id;
      const user = await User.findById(req.user._id)
        .populate('branch')
        .populate('role');
      if (!user) return res.redirect('/');

      const adjustment = await PriceAdjustment.findById(adjustmentId).populate({
        path: 'product',
        populate: { path: 'branch' }
      });

      if (!adjustment) return res.status(404).send('Price adjustment not found');

      if (
        user.role.name.toLowerCase() !== 'owner' &&
        !adjustment.product.branch._id.equals(user.branch._id)
      ) {
        return res.redirect('/unauthorized');
      }

        await ActionLog.create({
        action: 'delete',
        operator: req.user._id,
        branch: adjustment.product.branch._id,
        particulars: `Deleted price adjustment for ${adjustment.product.product} (${adjustment.variants[0]?.unitCode || 'N/A'}) — Old Price: ${adjustment.variants[0]?.oldPrice || 'N/A'}, New Price: ${adjustment.variants[0]?.newPrice || 'N/A'}, Notes: ${adjustment.notes || 'N/A'}`,
        targetModel: 'PriceAdjustment',
        targetId: adjustment._id
      });
      await PriceAdjustment.findByIdAndDelete(adjustmentId);

      res.redirect('/price-adjustments');
    } catch (err) {
      console.error('Error deleting price adjustment:', err);
      next(err);
    }
  }
);



router.get(
  "/stockTransfer",
  checkPermission("stock-transfer"),
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    const selectedBranchId = req.query.branchId;
    const currentSort = req.query.sort;

    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      const allBranches = await Branch.find();

      // If owner, allow selection of any branch; otherwise restrict to user's branch only
      let branchToUse;
      let branchesToShow;

      if (user.role.name.toLowerCase() === "owner") {
        branchToUse = selectedBranchId || user.branch._id;
        branchesToShow = allBranches;
      } else {
        branchToUse = user.branch._id;
        branchesToShow = [user.branch];
      }

      const branchDoc = allBranches.find(b => b._id.equals(branchToUse));

      const products = await Product.find({ branch: branchToUse })
        .populate("variants.supplier")
        .populate("branch");

      let sortOption = { date: -1 };
      if (currentSort === "ascending") sortOption = { date: 1 };
      else if (currentSort === "descending") sortOption = { date: -1 };

      let dateFilter = {};
      if (currentSort === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateFilter.date = { $gte: today };
      } else if (currentSort === "lastMonth") {
        const now = new Date();
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        dateFilter.date = { $gte: firstDayLastMonth, $lte: lastDayLastMonth };
      } else if (currentSort === "last7days") {
        const last7days = new Date();
        last7days.setDate(last7days.getDate() - 7);
        dateFilter.date = { $gte: last7days };
      }

      const transfers = await TransferStock.find({
        $and: [
          {
            $or: [
              { branch_from: branchToUse },
              { branch_to: branchToUse }
            ]
          },
          dateFilter
        ]
      })
        .populate("branch_from")
        .populate("branch_to")
        .populate("product")
        .sort(sortOption);

      res.render("Product/stockTransfer", {
        user,
        ownerBranch: { branch: branchDoc },
        branches: branchesToShow,
        selectedBranchId: branchToUse,
        products,
        transfers,
        currentSort
      });
    } catch (err) {
      console.error("Error loading stockTransfer page:", err);
      res.status(500).send("Server error.");
    }
  }
);



router.get('/api/branch-products/:branchId', async (req, res) => {
  try {
    const products = await Product.find({ branch: req.params.branchId })
      .select('product variants');
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

  
// });
router.post('/stock-transfer', async (req, res, next) => {
  const {
    branch_from,
    branch_to,
    product,        // array
    unitCode,       // array
    transferQTY,    // array
    invoice_number,
    payment_date,
    notes
  } = req.body;

  const sendingBranch = branch_from;
  const receivingBranch = branch_to;
  const userId = req.user._id;

  try {
    const receivingBranchDoc = await Branch.findById(receivingBranch);
    if (!receivingBranchDoc) throw new Error('Receiving branch not found');
    const receivingBranchName = receivingBranchDoc.branch_name || '';

    // Loop through all products
    for (let i = 0; i < product.length; i++) {
      const prodName = product[i];
      const unit = unitCode[i];
      const qty = parseFloat(transferQTY[i]);
      if (!prodName || !unit || !qty || qty <= 0) continue;

      // Find source product
      const sourceProduct = await Product.findOne({ product: prodName, branch: sendingBranch });
      if (!sourceProduct) throw new Error(`Product '${prodName}' not found in source branch`);

      const variantIndex = sourceProduct.variants.findIndex(v => v.unitCode === unit);
      if (variantIndex === -1) throw new Error(`Unit ${unit} not found in source product`);

      // Find or create receiving product
      let receivingProduct = await Product.findOne({ product: prodName, branch: receivingBranch });

      if (!receivingProduct) {
        const clonedVariants = JSON.parse(JSON.stringify(sourceProduct.variants));
        for (let v of clonedVariants) {
          v.quantity = v.unitCode === unit 
            ? qty 
            : qty * (v.totalInBaseUnit || 0);
        }

        receivingProduct = await Product.create({
          product: sourceProduct.product,
          category: sourceProduct.category,
          branch: receivingBranch,
          product_detail: sourceProduct.product_detail,
          mfgDate: sourceProduct.mfgDate,
          expDate: sourceProduct.expDate,
          product_image: sourceProduct.product_image,
          supplierPrice: sourceProduct.supplierPrice,
          variants: clonedVariants
        });

        await Branch.findByIdAndUpdate(receivingBranch, { $addToSet: { stock: receivingProduct._id } });
      } else {
        // Update receiving product quantities
        const receivingVariantIndex = receivingProduct.variants.findIndex(v => v.unitCode === unit);
        if (receivingVariantIndex === -1) throw new Error('Unit not found in receiving product');

        receivingProduct.variants[receivingVariantIndex].quantity += qty;

        const newBaseQty = receivingProduct.variants[receivingVariantIndex].quantity;
        for (let j = 0; j < receivingProduct.variants.length; j++) {
          if (j !== receivingVariantIndex) {
            receivingProduct.variants[j].quantity = newBaseQty * (receivingProduct.variants[j].totalInBaseUnit || 0);
          }
        }

        await receivingProduct.save();
      }

      // Deduct from source
      sourceProduct.variants[variantIndex].quantity -= qty;
      if (sourceProduct.variants[variantIndex].quantity < 0) {
        return res.status(400).json({ error: `Insufficient quantity for product '${prodName}' in source branch.` });
      }

      const updatedQty = sourceProduct.variants[variantIndex].quantity;
      for (let j = 0; j < sourceProduct.variants.length; j++) {
        if (j !== variantIndex) {
          sourceProduct.variants[j].quantity = updatedQty * (sourceProduct.variants[j].totalInBaseUnit || 0);
        }
      }

      await sourceProduct.save();

      // Find latest ledger balances
      const getLatestLedgerBalances = async (productId, branchId) => {
        const lastLedger = await StockLedger.findOne({ product: productId, branch: branchId }).sort({ date: -1 });
        if (lastLedger) {
          return lastLedger.variants.reduce((map, v) => {
            map[v.unitCode] = { cost_price: v.cost_price || 0, total_sales: v.total_sales || 0 };
            return map;
          }, {});
        }
        return {};
      };

      const sourceBalances = await getLatestLedgerBalances(sourceProduct._id, sendingBranch);
      const receivingBalances = await getLatestLedgerBalances(receivingProduct._id, receivingBranch);

      // Create ledger entries
      const createLedgerEntry = async (branch, type, productDoc, qtyChange, balances, customer) => {
        return StockLedger.create({
          date: new Date(payment_date),
          product: productDoc._id,
          operator: userId,
          branch,
          particular: "Transfer",
          stock_ID: invoice_number,
          customer,
          variants: productDoc.variants.map(v => ({
            unitCode: v.unitCode,
            stock_in: type === 'in' && v.unitCode === unit ? qtyChange : 0,
            stock_out: type === 'out' && v.unitCode === unit ? qtyChange : 0,
            balance: v.quantity,
            cost_price: balances[v.unitCode]?.cost_price || 0,
            total_sales: balances[v.unitCode]?.total_sales || 0
          }))
        });
      };

      await createLedgerEntry(sendingBranch, 'out', sourceProduct, qty, sourceBalances, receivingBranchName);
      await createLedgerEntry(receivingBranch, 'in', receivingProduct, qty, receivingBalances, receivingBranchName);

      // Save transfer record
      await TransferStock.create({
        branch_from: sendingBranch,
        branch_to: receivingBranch,
        product: sourceProduct._id,
        unitCode: unit,
        quantity: qty,
        invoice_number,
        date: new Date(payment_date),
        notes: notes || '',
        createdBy: userId
      });
    }

    res.redirect('/stockTransfer');
  } catch (err) {
    console.error('Transfer stock error:', err);
    next(err);
  }
});




router.post('/edit-transfer', async (req, res, next) => {
  const {
    transferId,
    branch_from,
    branch_to,
    product,           // product ObjectId
    unitCode,          // e.g., "pcs"
    quantity,          // new quantity entered by user
    invoice_number,
    date,
    notes
  } = req.body;

  const userId = req.user._id;
  const newQty = parseFloat(quantity);
  const oldUnit = unitCode;

  try {
    // Find old transfer
    const oldTransfer = await TransferStock.findById(transferId);
    if (!oldTransfer) throw new Error('Transfer record not found');

    const oldQty = oldTransfer.quantity;

    // Find receiving branch name
    const receivingBranchDoc = await Branch.findById(branch_to);
    if (!receivingBranchDoc) throw new Error('Receiving branch not found');
    const receivingBranchName = receivingBranchDoc.branch_name || '';

    // Find products
    const sourceProduct = await Product.findOne({ _id: oldTransfer.product, branch: branch_from });
    if (!sourceProduct) throw new Error('Source product not found');

    const receivingProduct = await Product.findOne({ product: sourceProduct.product, branch: branch_to });
    if (!receivingProduct) throw new Error('Receiving product not found');

    // Variant indexes
    const variantIndex = sourceProduct.variants.findIndex(v => v.unitCode === oldUnit);
    if (variantIndex === -1) throw new Error(`Unit ${oldUnit} not found in source product`);

    const receivingVariantIndex = receivingProduct.variants.findIndex(v => v.unitCode === oldUnit);
    if (receivingVariantIndex === -1) throw new Error(`Unit ${oldUnit} not found in receiving product`);

    // Difference
    const qtyDiff = newQty - oldQty;

    if (qtyDiff !== 0) {
      const absDiff = Math.abs(qtyDiff);

      if (qtyDiff > 0) {
        // New qty > old → transfer extra
        sourceProduct.variants[variantIndex].quantity -= absDiff;
        if (sourceProduct.variants[variantIndex].quantity < 0) throw new Error('Insufficient stock in source branch');
        receivingProduct.variants[receivingVariantIndex].quantity += absDiff;
      } else {
        // New qty < old → return excess
        sourceProduct.variants[variantIndex].quantity += absDiff;
        receivingProduct.variants[receivingVariantIndex].quantity -= absDiff;
        if (receivingProduct.variants[receivingVariantIndex].quantity < 0) throw new Error('Negative stock in receiving branch');
      }

      // Recalculate proportional quantities (source)
      const updatedSourceBaseQty = sourceProduct.variants[variantIndex].quantity;
      sourceProduct.variants.forEach((v, i) => {
        if (i !== variantIndex) v.quantity = updatedSourceBaseQty * (v.totalInBaseUnit || 0);
      });

      // Recalculate proportional quantities (receiving)
      const updatedReceivingBaseQty = receivingProduct.variants[receivingVariantIndex].quantity;
      receivingProduct.variants.forEach((v, i) => {
        if (i !== receivingVariantIndex) v.quantity = updatedReceivingBaseQty * (v.totalInBaseUnit || 0);
      });

      // Save changes
      await sourceProduct.save();
      await receivingProduct.save();

      // Ledger common fields
      const commonData = {
        date: new Date(date),
        operator: userId,
        particular: 'Transfer',
        stock_ID: 'edit',
        customer: receivingBranchName
      };

      if (qtyDiff > 0) {
        // extra transfer
        await StockLedger.create({
          ...commonData,
          product: sourceProduct._id,
          branch: branch_from,
          variants: sourceProduct.variants.map(v => ({
            unitCode: v.unitCode,
            stock_in: 0,
            stock_out: v.unitCode === oldUnit ? absDiff : 0,
            balance: v.quantity,
            cost_price: v.cost_price || 0,
            total_sales: 0
          }))
        });
        await StockLedger.create({
          ...commonData,
          product: receivingProduct._id,
          branch: branch_to,
          variants: receivingProduct.variants.map(v => ({
            unitCode: v.unitCode,
            stock_in: v.unitCode === oldUnit ? absDiff : 0,
            stock_out: 0,
            balance: v.quantity,
            cost_price: v.cost_price || 0,
            total_sales: 0
          }))
        });
      } else {
        // reduced transfer
        await StockLedger.create({
          ...commonData,
          product: sourceProduct._id,
          branch: branch_from,
          variants: sourceProduct.variants.map(v => ({
            unitCode: v.unitCode,
            stock_in: v.unitCode === oldUnit ? absDiff : 0,
            stock_out: 0,
            balance: v.quantity,
            cost_price: v.cost_price || 0,
            total_sales: 0
          }))
        });
        await StockLedger.create({
          ...commonData,
          product: receivingProduct._id,
          branch: branch_to,
          variants: receivingProduct.variants.map(v => ({
            unitCode: v.unitCode,
            stock_in: 0,
            stock_out: v.unitCode === oldUnit ? absDiff : 0,
            balance: v.quantity,
            cost_price: v.cost_price || 0,
            total_sales: 0
          }))
        });
      }
    }

    // Update transfer record
    oldTransfer.quantity = newQty;
    oldTransfer.invoice_number = invoice_number;
    oldTransfer.date = new Date(date);
    oldTransfer.notes = notes || '';
    await oldTransfer.save();

    // Action log
    await ActionLog.create({
      action: 'edit',
      operator: userId,
      branch: branch_from,
      particulars: `Edited transfer #${oldTransfer.invoice_number} (Qty: ${oldQty} → ${newQty})`,
      targetModel: 'TransferStock',
      targetId: oldTransfer._id
    });

    res.redirect('/stockTransfer');
  } catch (err) {
    console.error('Edit transfer error:', err);
    next(err);
  }
});

router.post('/delete-transfer', async (req, res, next) => {
  const { transferId } = req.body;
  const userId = req.user._id;

  try {
    const transfer = await TransferStock.findById(transferId);
    if (!transfer) throw new Error('Transfer not found');

    const { branch_from, branch_to, product, unitCode, quantity, invoice_number } = transfer;

    const oldQty = quantity;

    // Get receiving branch name for ledger customer field
    const receivingBranchDoc = await Branch.findById(branch_to);
    const receivingBranchName = receivingBranchDoc ? receivingBranchDoc.branch_name : '';

    // Find products
    const sourceProduct = await Product.findOne({ _id: product, branch: branch_from });
    if (!sourceProduct) throw new Error('Source product not found');

    const receivingProduct = await Product.findOne({ product: sourceProduct.product, branch: branch_to });
    if (!receivingProduct) throw new Error('Receiving product not found');

    const variantIndex = sourceProduct.variants.findIndex(v => v.unitCode === unitCode);
    if (variantIndex === -1) throw new Error(`Unit ${unitCode} not found in source product`);

    const receivingVariantIndex = receivingProduct.variants.findIndex(v => v.unitCode === unitCode);
    if (receivingVariantIndex === -1) throw new Error(`Unit ${unitCode} not found in receiving product`);

    // Reverse transfer:
    // Add back to source
    sourceProduct.variants[variantIndex].quantity += oldQty;

    // Deduct from receiving
    receivingProduct.variants[receivingVariantIndex].quantity -= oldQty;
    if (receivingProduct.variants[receivingVariantIndex].quantity < 0) throw new Error('Negative stock after reversal');

    // Recalculate proportional quantities
    const updatedSourceBaseQty = sourceProduct.variants[variantIndex].quantity;
    sourceProduct.variants.forEach((v, i) => {
      if (i !== variantIndex) v.quantity = updatedSourceBaseQty * (v.totalInBaseUnit || 0);
    });

    const updatedReceivingBaseQty = receivingProduct.variants[receivingVariantIndex].quantity;
    receivingProduct.variants.forEach((v, i) => {
      if (i !== receivingVariantIndex) v.quantity = updatedReceivingBaseQty * (v.totalInBaseUnit || 0);
    });

    await sourceProduct.save();
    await receivingProduct.save();

    // Add ledger entries:
    const commonData = {
      date: new Date(),
      operator: userId,
      particular: 'Delete Transfer',
      stock_ID: invoice_number,
      customer: receivingBranchName
    };

    // Source: add back → stock_in
    await StockLedger.create({
      ...commonData,
      product: sourceProduct._id,
      branch: branch_from,
      variants: sourceProduct.variants.map(v => ({
        unitCode: v.unitCode,
        stock_in: v.unitCode === unitCode ? oldQty : 0,
        stock_out: 0,
        balance: v.quantity,
        cost_price: v.cost_price || 0,
        total_sales: 0
      }))
    });

    // Receiving: deduct → stock_out
    await StockLedger.create({
      ...commonData,
      product: receivingProduct._id,
      branch: branch_to,
      variants: receivingProduct.variants.map(v => ({
        unitCode: v.unitCode,
        stock_in: 0,
        stock_out: v.unitCode === unitCode ? oldQty : 0,
        balance: v.quantity,
        cost_price: v.cost_price || 0,
        total_sales: 0
      }))
    });

    // Remove the transfer record
    await transfer.deleteOne();

    // Action log
    await ActionLog.create({
      action: 'delete',
      operator: userId,
      branch: branch_from,
      particulars: `Deleted transfer #${invoice_number} of ${oldQty} ${unitCode} to ${receivingBranchName}`,
      targetModel: 'TransferStock',
      targetId: transferId
    });

    res.redirect('/stockTransfer');
  } catch (err) {
    console.error('Delete transfer error:', err);
    next(err);
  }
});





// STOCK ROUTE ENDS HERE 

// RECEIVE STOCK ROUTE 
router.get(
  "/purchase-stock",
  checkPermission("view-purchases"),
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    try {
      const user = await User.findById(req.user._id).populate("branch role");
      if (!user) return res.redirect("/");

      const selectedBranchId = req.query.branchId;

      if (user.role.name === "owner") {
        const allBranches = await Branch.find();
        const branchToFilter = selectedBranchId || user.branch._id;
        const [stock, suppliers, ownerBranch] = await Promise.all([
          ReceivedStock.find({ branch: branchToFilter }).populate("supplier branch"),
          Supplier.find().populate("supplierInvoice"),
          Branch.findById(user.branch),
        ]);

        return res.render("PurchaseStock/purchase-stock", {
          user,
          ownerBranch: { branch: ownerBranch },
          branches: allBranches,
          selectedBranchId: branchToFilter,
          stock,
          suppliers,
        });
      } else {
        const [stock, suppliers] = await Promise.all([
          ReceivedStock.find({ branch: user.branch._id }).populate("supplier branch"),
          Supplier.find().populate("supplierInvoice"),
        ]);

        return res.render("PurchaseStock/purchase-stock", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId: user.branch._id,
          stock,
          suppliers,
        });
      }
    } catch (err) {
      console.error("Error in purchase-stock route:", err);
      return res.redirect("/error-404");
    }
  }
);


router.post('/addReceiveStock', async (req, res, next) => {
  const {
    invoice_number,
    supplier,
    payment_date,
    paid_amount,
    payment_status,
    item_name,
    product_id,
    unitCode,
    item_qty,
    item_rate
  } = req.body;

  const wrapAsArray = val => (Array.isArray(val) ? val : [val]);

  const names = wrapAsArray(item_name);
  const ids = wrapAsArray(product_id);
  const units = wrapAsArray(unitCode);
  const qtys = wrapAsArray(item_qty);
  const rates = wrapAsArray(item_rate);

  const branch = req.user ? req.user.branch : null;
  if (!branch) return res.status(400).send('Branch information is required.');

  try {
    // === Fetch supplier document first ===
    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) return res.status(404).send('Supplier not found');

    // === Filter out empty product rows ===
    const filtered = [];
    for (let i = 0; i < names.length; i++) {
      if (
        ids[i] && ids[i].trim() !== '' &&
        units[i] && units[i].trim() !== '' &&
        qtys[i] && parseFloat(qtys[i]) > 0 &&
        rates[i] && parseFloat(rates[i]) > 0
      ) {
        filtered.push({
          name: names[i],
          id: ids[i],
          unit: units[i],
          qty: parseFloat(qtys[i]),
          rate: parseFloat(rates[i])
        });
      }
    }

    if (filtered.length === 0) return res.status(400).send('No valid product items submitted.');

    const items = [];
    let grandTotal = 0;

    for (const productData of filtered) {
      const total = productData.qty * productData.rate;
      grandTotal += total;

      items.push({
        product: productData.id,
        item_name: productData.name,
        unitCode: productData.unit,
        item_qty: productData.qty,
        item_rate: productData.rate,
        item_total: total
      });

      const product = await Product.findById(productData.id);
      if (!product || !product.variants || product.variants.length === 0) continue;

      const baseIndex = product.variants.findIndex(v => v.unitCode === productData.unit);
      if (baseIndex === -1) continue;

      // increase stock
      product.variants[baseIndex].quantity += productData.qty;
      product.supplierPrice = productData.rate;

      const baseQty = product.variants[baseIndex].quantity;

      // recalculate others
      for (let j = 0; j < product.variants.length; j++) {
        if (j !== baseIndex) {
          product.variants[j].quantity = baseQty * product.variants[j].totalInBaseUnit;
        }
      }

      await product.save();

      // create ledger
      await StockLedger.create({
        date: new Date(payment_date),
        product: product._id,
        operator: req.user._id,
        branch,
        particular: 'Purchase',
        stock_ID: invoice_number,
        customer: supplierDoc.supplier,    // supplier name
        variants: product.variants.map(variant => ({
          unitCode: variant.unitCode,
          stock_in: variant.unitCode === productData.unit ? productData.qty : 0,
          stock_out: 0,
          balance: variant.quantity,
          cost_price: productData.rate,
          total_sales: 0
        }))
      });
    }

    // save purchase
    await ReceivedStock.create({
      invoice_number,
      supplier,
      branch,
      operator: req.user._id,
      payment_date,
      items,
      grand_total: grandTotal,
      paid_amount,
      due_amount: grandTotal - paid_amount,
      payment_status
    });

    res.redirect('/purchase-stock');

  } catch (err) {
    console.error('Error adding ReceiveStock:', err);
    next(err);
  }
});

router.get("/managePurchase", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;
  const sortParam = req.query.sort || "recently";  // default sort

  let sortQuery = { created_at: -1 }; // default sort: recently added

  // build date filters if needed
  let dateFilter = null;

  if (sortParam === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateFilter = { $gte: today };
    sortQuery = null;
  } else if (sortParam === "lastMonth") {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    dateFilter = { $gte: lastMonth };
    sortQuery = null;
  } else if (sortParam === "last7days") {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    dateFilter = { $gte: sevenDaysAgo };
    sortQuery = null;
  } else if (sortParam === "ascending") {
    sortQuery = { created_at: 1 };
  } else if (sortParam === "descending") {
    sortQuery = { created_at: -1 };
  }

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      const branchToFilter = selectedBranchId || user.branch._id;
      let stockQuery = { branch: branchToFilter };
      if (dateFilter) {
        stockQuery.created_at = dateFilter;
      }

      let fetchStock = ReceivedStock.find(stockQuery)
        .populate('supplier branch operator');

      if (sortQuery) {
        fetchStock = fetchStock.sort(sortQuery);
      }

      if (user.role === 'owner') {
        Branch.find().then(allBranches => {
          Promise.all([
            fetchStock,
            Supplier.find().populate('supplierInvoice'),
            Branch.findById(branchToFilter)
          ])
            .then(([stock, suppliers, ownerBranch]) => {
              res.render("PurchaseStock/manage-purchase", {
                user,
                ownerBranch: { branch: ownerBranch },
                branches: allBranches,
                selectedBranchId: branchToFilter,
                stock,
                suppliers,
                currentSort: sortParam
              });
            })
            .catch(err => {
              console.error("Error fetching stock/suppliers:", err);
              res.redirect("/error-404");
            });
        });
      } else {
        Promise.all([
          fetchStock,
          Supplier.find().populate('supplierInvoice')
        ])
          .then(([stock, suppliers]) => {
            res.render("PurchaseStock/manage-purchase", {
              user,
              ownerBranch: { branch: user.branch },
              branches: [user.branch],
              selectedBranchId: user.branch._id,
              stock,
              suppliers,
              currentSort: sortParam
            });
          })
          .catch(err => {
            console.error("Error fetching stock/suppliers:", err);
            res.redirect("/error-404");
          });
      }
    })
    .catch(err => {
      console.error("Error fetching user:", err);
      res.redirect("/error-404");
    });
});






router.post('/updateReceiveStock', async (req, res, next) => {
  try {
    const {
      invoice_number,
      supplier,
      payment_date,
      paid_amount,
      item_name,
      product_id,
      unitCode,
      item_qty,
      item_rate
    } = req.body;

    const branch = req.user?.branch;
    const operator = req.user?._id;

    if (!branch || !invoice_number) {
      return res.status(400).send('Missing branch or invoice number.');
    }

    // Fetch supplier document
    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) return res.status(404).send('Supplier not found.');

    // Convert fields to arrays safely
    const names = Array.isArray(item_name) ? item_name : [item_name];
    const ids = Array.isArray(product_id) ? product_id : [product_id];
    const units = Array.isArray(unitCode) ? unitCode : [unitCode];
    const qtys = Array.isArray(item_qty) ? item_qty : [item_qty];
    const rates = Array.isArray(item_rate) ? item_rate : [item_rate];

    let grandTotal = 0;
    const updatedItems = [];

    // Find original ReceivedStock
    const originalStock = await ReceivedStock.findOne({ invoice_number }).lean(); // use .lean() to get plain object
    if (!originalStock) return res.status(404).send('Original purchase not found.');

    for (let i = 0; i < names.length; i++) {
      const product = await Product.findById(ids[i]);
      if (!product || !product.variants || product.variants.length === 0) continue;

      const baseIndex = product.variants.findIndex(v => v.unitCode === units[i]);
      if (baseIndex === -1) continue;

      const newQty = parseFloat(qtys[i]) || 0;
      const newRate = parseFloat(rates[i]) || 0;

      // Find previous quantity
      const prevItem = originalStock.items.find(it =>
        String(it.product) === String(ids[i]) && it.unitCode === units[i]
      );
      const prevQty = prevItem ? prevItem.item_qty : 0;

      const qtyDiff = newQty - prevQty;

      // Adjust product stock
      product.variants[baseIndex].quantity += qtyDiff;
      product.supplierPrice = newRate;

      const baseQty = product.variants[baseIndex].quantity;

      // Recalculate other variants
      for (let j = 0; j < product.variants.length; j++) {
        if (j !== baseIndex) {
          product.variants[j].quantity = baseQty * product.variants[j].totalInBaseUnit;
        }
      }

      await product.save();

      // Add StockLedger entry
      await StockLedger.create({
        date: new Date(payment_date),
        product: product._id,
        customer: supplierDoc.supplier,
        operator,
        branch,
        stock_ID: "edit",
        particular: "Purchase",
        variants: product.variants.map(variant => ({
          unitCode: variant.unitCode,
          cost_price: newRate,
          stock_in: qtyDiff > 0 && variant.unitCode === units[i] ? qtyDiff : 0,
          stock_out: qtyDiff < 0 && variant.unitCode === units[i] ? Math.abs(qtyDiff) : 0,
          balance: variant.quantity,
          total_sales: 0
        }))
      });

      const total = newQty * newRate;
      grandTotal += total;

      updatedItems.push({
        product: ids[i],
        item_name: names[i],
        unitCode: units[i],
        item_qty: newQty,
        item_rate: newRate,
        item_total: total
      });
    }

    // Update ReceivedStock
    const updatedStock = await ReceivedStock.findOneAndUpdate(
      { invoice_number },
      {
        supplier,
        payment_date,
        items: updatedItems,
        grand_total: grandTotal,
        paid_amount,
        due_amount: grandTotal - paid_amount
      },
      { new: true, lean: true }
    );

    await ActionLog.create({
      action: "edit",
      operator,
      branch,
      particulars: `Edited purchase invoice ${invoice_number}`,
      targetModel: "ReceivedStock",
      targetId: originalStock._id
    });

    res.redirect('/purchase-stock');

  } catch (err) {
    console.error('Update ReceiveStock Error:', err);
    next(err);
  }
});


router.post('/deleteReceiveStock', async (req, res, next) => {
  try {
    const { invoice_number } = req.body;

    if (!invoice_number) {
      return res.status(400).send('Missing invoice number.');
    }

    const originalStock = await ReceivedStock.findOne({ invoice_number }).populate('supplier');
    if (!originalStock) return res.status(404).send('Purchase not found.');

    const branch = req.user?.branch;
    const operator = req.user?._id;

    if (!branch) return res.status(400).send('Missing branch.');

    for (const item of originalStock.items) {
      const product = await Product.findById(item.product);
      if (!product || !product.variants || product.variants.length === 0) continue;

      const baseIndex = product.variants.findIndex(v => v.unitCode === item.unitCode);
      if (baseIndex === -1) continue;

      product.variants[baseIndex].quantity -= item.item_qty;
      const baseQty = product.variants[baseIndex].quantity;

      for (let j = 0; j < product.variants.length; j++) {
        if (j !== baseIndex) {
          product.variants[j].quantity = baseQty * product.variants[j].totalInBaseUnit;
        }
      }

      await product.save();

      await StockLedger.create({
        date: new Date(),
        product: product._id,
        customer: originalStock.supplier?.supplier || '',
        operator,
        branch,
        stock_ID: 'delete',
        particular: 'Purchase Deleted',
        variants: product.variants.map(variant => ({
          unitCode: variant.unitCode,
          cost_price: item.item_rate,
          stock_in: 0,
          stock_out: variant.unitCode === item.unitCode ? item.item_qty : 0,
          balance: variant.quantity,
          total_sales: 0
        }))
      });
    }

    await ActionLog.create({
      action: 'delete',
      operator,
      branch,
      particulars: `Deleted purchase invoice ${invoice_number}`,
      targetModel: 'ReceivedStock',
      targetId: originalStock._id
    });
    await ReceivedStock.deleteOne({ invoice_number });

    return res.redirect('/purchase-stock');

  } catch (err) {
    console.error('Delete ReceiveStock Error:', err);
    next(err);
  }
});




// UNIT CODE 
router.get(
  "/addUnit",
  checkPermission("view-units"),
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    const selectedBranchId = req.query.branchId;

    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");
      if (!user) return res.redirect("/");

      const allUnits = await Unit.find().sort({ createdAt: -1 });

      if (user.role.name.toLowerCase() === "owner") {
        const allBranches = await Branch.find();
        const branchToUse = selectedBranchId || user.branch._id;

        const selectedBranchDoc = allBranches.find(b => b._id.equals(branchToUse));

        return res.render("Unit/unit", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: allBranches,
          selectedBranchId: branchToUse,
          units: allUnits
        });
      } else {
        res.render("Unit/unit", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId: user.branch._id,
          units: allUnits
        });
      }
    } catch (err) {
      console.error("Error loading addUnit:", err);
      res.redirect("/error-404");
    }
  }
);




router.post(
  "/addUnit",
  checkPermission("add-units"),
  async (req, res) => {
    try {
      const { unit_name, status } = req.body;

      const newUnit = new Unit({
        unit_name,
        status: status === "on" ? "Active" : "Inactive",
        productCount: 0
      });

      await newUnit.save();
      res.redirect("/addUnit");
    } catch (err) {
      console.error("Error adding unit:", err);
      res.status(500).json({ message: "Failed to add unit", error: err.message });
    }
  }
);


router.post(
  "/updateUnit/:id",
  checkPermission("modify-units"),
  async (req, res, next) => {
    try {
      const unitId = req.params.id;
      const { unit_name, status } = req.body;

      const updates = {
        unit_name,
        status: status === "on" ? "Active" : "Inactive"
      };

      await Unit.findByIdAndUpdate(unitId, updates);
      res.redirect("/addUnit");
    } catch (error) {
      console.error("Failed to update unit:", error);
      next(error);
    }
  }
);


router.post(
  "/deleteUnit/:id",
  checkPermission("delete-units"),
  async (req, res, next) => {
    try {
      await Unit.findByIdAndDelete(req.params.id);
      res.redirect("/addUnit");
    } catch (err) {
      console.error("Error deleting unit:", err);
      next(err);
    }
  }
);

// UNIT CODE ENDS HERE

// CATEGORIES STARTS 
router.get(
  "/addCategory",
  checkPermission("view-categories"),
  (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    const selectedBranchId = req.query.branchId;

    User.findById(req.user._id)
      .populate("branch")
      .then(user => {
        if (!user) return res.redirect("/");

        const renderCategoryPage = (branchList, ownerBranch, selectedBranchIdToUse) => {
          Category.find()
            .then(categories => {
              res.render("Category/category", {
                user,
                ownerBranch: { branch: ownerBranch },
                branches: branchList,
                selectedBranchId: selectedBranchIdToUse,
                categories
              });
            })
            .catch(err => {
              console.error("Error fetching categories:", err);
              res.redirect("/error-404");
            });
        };

        if (user.role.name === 'owner') {
          Branch.find()
            .then(allBranches => {
              const branchToUse = selectedBranchId || user.branch._id;

              const selectedBranchDoc = allBranches.find(b => b._id.equals(branchToUse));

              renderCategoryPage(allBranches, selectedBranchDoc, branchToUse);
            })
            .catch(err => {
              console.error(err);
              res.redirect("/error-404");
            });
        } else {
          // Staff: always own branch
          renderCategoryPage([user.branch], user.branch, user.branch._id);
        }
      })
      .catch(err => {
        console.error(err);
        res.redirect("/error-404");
      });
  }
);



router.post(
  "/addCategories",
  checkPermission("add-category"),
  (req, res) => {
    const { category_name } = req.body;

    const newCategory = new Category({
      category_name
    });

    newCategory.save()
      .then(savedCategory => {
        res.redirect("/addCategory");
      })
      .catch(err => {
        console.error("Error adding category:", err);
        res.status(500).json({ message: "Failed to add category", error: err.message });
      });
  }
);


router.post(
  "/update/category/:id",
  checkPermission("modify-category"),
  async (req, res, next) => {
    try {
      const { category_name } = req.body;
      const categoryId = req.params.id;

      await Category.findByIdAndUpdate(categoryId, { category_name });
      res.redirect("/addCategory");
    } catch (error) {
      console.error("Update category error:", error);
      next(error);
    }
  }
);


router.post(
  "/delete/category/:id",
  checkPermission("delete-category"),
  async (req, res, next) => {
    try {
      await Category.findByIdAndDelete(req.params.id);
      res.redirect("/addCategory");
    } catch (error) {
      console.error("Delete category error:", error);
      next(error);
    }
  }
);


router.post(
  "/addCategories-product",
  checkPermission("add-category"),
  (req, res) => {
    const { category_name } = req.body;

    const newCategory = new Category({
      category_name
    });

    newCategory.save()
      .then(savedCategory => {
        res.redirect("/addProduct");
      })
      .catch(err => {
        console.error("Error adding category:", err);
        res.status(500).json({ message: "Failed to add category", error: err.message });
      });
  }
);

// CATEGORY ENDS HERE --------- TECH MAYOR GROUPS 


// BRANCH STARTS HERE 
router.get("/manageBranch", (req, res) => {
  if (req.isAuthenticated()) {
    User.findById(req.user._id)
      .populate("branch")
      .then(user => {
        if (!user) return res.redirect("/");

        Category.find()
          .then(categories => {
            // Owner or admin: show all branches
            if (user.role === 'owner' || user.role === 'admin') {
              Branch.findById(user.branch)
                .then(ownerBranch => {
                  Branch.find()
                    .populate({
                      path: 'stock',
                      populate: { path: 'category' }
                    })
                    .then(allBranches => {
                      res.render("Branch/branch", {
                        user: user,
                        ownerBranch: { branch: ownerBranch },
                        branches: allBranches,
                        Category: categories
                      });
                    })
                    .catch(err => {
                      console.error("Error fetching all branches:", err);
                      res.redirect("/error-404");
                    });
                })
                .catch(err => {
                  console.error("Error fetching owner branch:", err);
                  res.redirect("/error-404");
                });
            } else {
              // Staff: show all branches too, but restrict edit/delete in view
              Branch.find()
                .populate({
                  path: 'stock',
                  populate: { path: 'category' }
                })
                .then(allBranches => {
                  res.render("Branch/branch", {
                    user: user,
                    ownerBranch: { branch: user.branch },
                    branches: allBranches,
                    Category: categories
                  });
                })
                .catch(err => {
                  console.error("Error fetching branches for staff:", err);
                  res.redirect("/error-404");
                });
            }
          })
          .catch(err => {
            console.error("Error fetching categories:", err);
            res.redirect("/error-404");
          });
      })
      .catch(err => {
        console.error("Error fetching user:", err);
        res.redirect("/error-404");
      });
  } else {
    res.redirect("/");
  }
});

router.post(
  "/addBranch",
  checkPermission("add-branch"),
  (req, res, next) => {
    const { branch_name, branch_address, branch_phone } = req.body;

    Branch.findOne({ branch_name: branch_name })
      .then(existingBranch => {
        if (existingBranch) {
          return next(new Error("Branch name already exists."));
        }

        const newBranch = new Branch({
          branch_name,
          branch_address,
          branch_phone
        });

        return newBranch.save();
      })
      .then(savedBranch => {
        if (savedBranch) {
          res.redirect("/manageBranch");
        }
      })
      .catch(err => {
        next(err);
      });
  }
);


router.post(
  "/updateBranch",
  checkPermission("modify-branch"),
  (req, res) => {
    console.log(req.body);

    const updateData = {
      branch_name: req.body.branch_name,
      branch_address: req.body.branch_address,
      branch_phone: req.body.branch_phone
    };

    Branch.findByIdAndUpdate(req.body.branch_id, { $set: updateData }, { new: true })
      .then(updatedDocument => {
        console.log("Updated Document:", updatedDocument);
        res.redirect("/manageBranch");
      })
      .catch(err => {
        console.error("Error updating document:", err);
      });
  }
);


router.get(
  "/deleteBranch/:id",
  checkPermission("delete-branch"),
  (req, res) => {
    const branchId = req.params.id;

    Branch.findByIdAndDelete(branchId)
      .then(() => {
        res.redirect("/manageBranch"); // or wherever your table is shown
      })
      .catch(err => {
        console.error("Delete failed:", err);
        res.redirect("/error-404");
      });
  }
);


// BRANCH ENDS HERE ----------------- TECH MAYOR GROUPS


// STORE ROUTE STARTS HERE
router.get(
  "/manageParkingStore",
  checkPermission("view-stores"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      let branchesToUse;
      let selectedBranchId;

      if (user.role.name.toLowerCase() === "owner") {
        // Middleware already attaches allBranches and selectedBranchId
        branchesToUse = req.allBranches || [];
        selectedBranchId = req.selectedBranchId;

        const ownerBranch = branchesToUse.find(b =>
          b._id.equals(selectedBranchId)
        );

        const parkingStores = await ParkingStore.find({ branch: selectedBranchId })
          .populate("branch", "branch_name");

        return res.render("Store/Store", {
          user,
          ownerBranch: { branch: ownerBranch },
          branches: branchesToUse,
          selectedBranchId,
          parkingStores
        });
      } else {
        // Non-owners see only their own branch
        branchesToUse = [user.branch];
        selectedBranchId = user.branch._id;

        const parkingStores = await ParkingStore.find({ branch: user.branch })
          .populate("branch", "branch_name");

        return res.render("Store/Store", {
          user,
          ownerBranch: { branch: user.branch },
          branches: branchesToUse,
          selectedBranchId,
          parkingStores
        });
      }
    } catch (err) {
      console.error("Error fetching parking stores:", err);
      res.redirect("/error-404");
    }
  }
);



router.get(
  "/stockAction",
  checkPermission("modify-store"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      if (user.role.name.toLowerCase() === "owner") {
        const ownerBranch = await Branch.findById(user.branch);
        const allBranches = await Branch.find();

        const parkingStores = await ParkingStore.find({ branch: user.branch })
          .populate("branch", "branch_name");

        return res.render("Store/storeAction", {
          user,
          ownerBranch: { branch: ownerBranch },
          branches: allBranches,
          parkingStores
        });
      } else {
        const parkingStores = await ParkingStore.find({ branch: user.branch })
          .populate("branch", "branch_name");

        return res.render("Store/storeAction", {
          user,
          ownerBranch: { branch: user.branch },
          parkingStores
        });
      }
    } catch (err) {
      console.error("Error fetching parking stores:", err);
      res.redirect("/error-404");
    }
  }
);


router.post(
  "/create-parking-store",
  checkPermission("create-store"),
  async (req, res) => {
    try {
      const { storeName } = req.body;
      const branch = req.user?.branch;
      const userId = req.user?._id;

      if (!storeName || !branch) {
        return res
          .status(400)
          .json({ error: "Store name and branch are required" });
      }

      // Check for existing store name in this branch
      const existing = await ParkingStore.findOne({ storeName, branch });
      if (existing) {
        return res
          .status(409)
          .json({ error: "Parking store name already exists for this branch" });
      }

      await ParkingStore.create({
        storeName,
        branch,
        createdBy: userId
      });

      res.redirect("/manageParkingStore");
    } catch (err) {
      console.error("Error creating parking store:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);



router.get('/searchProduct', async (req, res) => {
  const { query } = req.query;
  const branchId = req.user.branch; // Logged-in user's branch

  if (!query || !branchId) {
    return res.status(400).json({ error: 'Missing query or branchId' });
  }

  try {
    const products = await Product.find({
      product: { $regex: query, $options: 'i' },
      branch: branchId
    }).limit(10);

    res.json({ products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post(
  "/updateStore",
  checkPermission("modify-store"),
  async (req, res, next) => {
    try {
      const { store_id, storeName } = req.body;
      const userId = req.user?._id;
      const branchId = req.user?.branch;

      // Find the current store document
      const store = await ParkingStore.findById(store_id);
      if (!store) return res.status(404).send("Store not found");

      const oldStoreName = store.storeName;

      // Update the store
      const updatedStore = await ParkingStore.findByIdAndUpdate(
        store_id,
        { $set: { storeName } },
        { new: true }
      );

      // Create ActionLog
      await ActionLog.create({
        action: 'edit',
        operator: userId,
        branch: branchId,
        particulars: `Updated Parking Store name from "${oldStoreName}" to "${storeName}"`,
        targetModel: 'ParkingStore',
        targetId: store._id
      });

      res.redirect("/manageParkingStore");
    } catch (err) {
      console.error("Error updating store:", err);
      next(err);
    }
  }
);



router.get(
  "/deleteStore/:id",
  checkPermission("delete-store"),
  async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.redirect('/');

      const storeId = req.params.id;
      const userId = req.user?._id;
      const branchId = req.user?.branch;

      const store = await ParkingStore.findById(storeId);
      if (!store) return res.redirect("/manageParkingStore");

      // Delete the store
      await ParkingStore.findByIdAndDelete(storeId);

      // Create ActionLog
      await ActionLog.create({
        action: 'delete',
        operator: userId,
        branch: branchId,
        particulars: `Deleted Parking Store: ${store.storeName || store._id}`,
        targetModel: 'ParkingStore',
        targetId: store._id
      });

      res.redirect("/manageParkingStore");
    } catch (err) {
      console.error("Error deleting store:", err);
      next(err);
    }
  }
);



// STORE ENDS HERE ----------------- TECH MAYOR GROUPS

// SALES ROUTE STARTS HERE 
router.get(
  "/createSales",
  checkPermission("view-sales"),
  (req, res, next) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    User.findById(req.user._id)
      .populate("branch")
      .then(user => {
        if (!user) return res.redirect("/");

        const branchId = user.branch._id || user.branch;

        const fetchCustomersAndProducts = (ownerBranch, allBranches) => {
          Promise.all([
            Customer.find({ branch: ownerBranch._id || ownerBranch }).sort({ createdAt: -1 }),
            Product.find({ branch: ownerBranch._id || ownerBranch }).sort({ createdAt: -1 }),
            Category.find({}),
            Config.findOne({ key: "negativeSalesActive" })
          ])
            .then(([customers, products, categories, config]) => {
              const negativeSalesActive = config?.value === true;

              res.render("Sales/createSales", {
                user,
                ownerBranch: { branch: ownerBranch },
                branches: allBranches || [],
                customers,
                products,
                categories,
                negativeSalesActive
              });
            })
            .catch(err => {
              console.error("Error fetching invoice data:", err);
              next(err);
            });
        };

        if (user.role === "owner") {
          Branch.findById(branchId)
            .then(ownerBranch => {
              Branch.find()
                .then(allBranches => {
                  fetchCustomersAndProducts(ownerBranch, allBranches);
                })
                .catch(err => {
                  console.error("Error fetching branches:", err);
                  next(err);
                });
            })
            .catch(err => {
              console.error("Error fetching owner branch:", err);
              next(err);
            });
        } else {
          fetchCustomersAndProducts(user.branch);
        }
      })
      .catch(err => {
        console.error("Error fetching user:", err);
        next(err);
      });
  }
);


router.post(
  "/settings/toggle-negative-sales",
  checkPermission("manage-settings"),
  async (req, res) => {
    try {
      const user = req.user;

      if (user.role.name.toLowerCase() !== "owner") {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden" });
      }

      let config = await Config.findOne({ key: "negativeSalesActive" });
      if (!config) {
        config = new Config({ key: "negativeSalesActive", value: true });
      } else {
        config.value = !config.value;
      }

      await config.save();

      res.json({ success: true, active: config.value });
    } catch (err) {
      console.error("Error toggling negative sales setting:", err);
      res
        .status(500)
        .json({ success: false, message: "Server Error" });
    }
  }
);

router.get('/searchCustomer', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  // Match any word starting with the first character of `q`, case-insensitive
  const firstLetter = q[0];
  const regex = new RegExp(`\\b${firstLetter}`, 'i');

  try {
    const customers = await Customer.find({ customer_name: regex }).limit(10);
    res.json(customers.map(c => ({
      _id: c._id,
      name: c.customer_name,
      credit_limit: c.credit_limit || 0,
      remaining_amount: c.remaining_amount || 0
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// Express route example
router.get("/getCustomerBalance", async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) return res.status(400).json({ balance: 0 });

    const ledger = await CustomerLedger.findOne({ customer: customerId })
      .sort({ createdAt: -1 });

    const balance = ledger ? ledger.Balance : 0;
    res.json({ balance });
  } catch (error) {
    console.error("Error fetching ledger balance:", error);
    res.status(500).json({ balance: 0 });
  }
});


router.get('/receipt/:invoiceId', async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId)
      .populate('branch')
      .populate('createdBy');

    if (!invoice) {
      return res.status(404).send('Invoice not found');
    }

    const branch = invoice.branch;
    const isHeadOffice = branch?.isHeadOffice;
    const creator = invoice.createdBy;

    const totalInWords = numberToWords.toWords(invoice.grand_total)
      .replace(/\b\w/g, l => l.toUpperCase());

    let headOffice = null;

    // ✅ Only find head office if current branch is NOT head office
    if (!isHeadOffice) {
      headOffice = await Branch.findOne({ isHeadOffice: true });
    }

    res.render('Sales/receipt', {
      invoice,
      branch,
      creator,
      isHeadOffice,
      headOffice,
      totalInWords
    });

  } catch (err) {
    console.error('Error loading receipt:', err);
    next(err);
  }
});

router.get(
  "/manage-sales",
  checkPermission("view-sales"),
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    try {
      const user = req.user;
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      const invoices = await Invoice.find({ branch: selectedBranchId })
        .populate("customer_id")
        .populate({
          path: "createdBy",
          populate: { path: "role" }
        })
        .sort({ createdAt: -1, _id: -1 });

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );

        return res.render("Sales/manage-sales", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          invoices,
        });
      } else {
        return res.render("Sales/manage-sales", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          invoices,
        });
      }
    } catch (err) {
      console.error("Error in manage-sales route:", err);
      return res.redirect("/error-404");
    }
  }
);





// SALES ROUTE ENDS HERE ................ TECH MYOR 


// EXPIRED PRODUCTS ROUTE STARTS HERE
router.get(
  "/expiredProducts",
  checkPermission("view-expired-products"),
  async (req, res) => {
    const currentDate = new Date();

    try {
      const user = req.user;
      const selectedBranchId =
        req.user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      const expiredProducts = await Product.find({
        branch: selectedBranchId,
        expDate: { $lt: currentDate }
      }).populate("branch category variants.supplier");

      if (expiredProducts.length > 0) {
        const pageLink = `/expiredProducts?branchId=${selectedBranchId}`;
        const existingNotification = await Notification.findOne({
          type: "expiredStock",
          pageLink,
          isDismissed: false
        });

        if (!existingNotification) {
          const branchName =
            user.role.name.toLowerCase() === "owner"
              ? req.allBranches.find(b => b._id.equals(selectedBranchId))
                  ?.branch_name
              : user.branch.branch_name;

          await Notification.create({
            title: "Expired Stock Alert",
            description: `There ${
              expiredProducts.length === 1 ? "is" : "are"
            } ${expiredProducts.length} expired product(s) at branch ${branchName}.`,
            type: "expiredStock",
            pageLink
          });
        }
      }

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );
        return res.render("ExpiredProducts/expiredProducts", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          expiredProducts
        });
      } else {
        return res.render("ExpiredProducts/expiredProducts", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          expiredProducts
        });
      }
    } catch (err) {
      console.error(err);
      res.redirect("/error-404");
    }
  }
);


router.post("/edit-expired-product", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const { product_id, mfgDate, expDate } = req.body;

  try {
    await Product.findByIdAndUpdate(product_id, {
      mfgDate: new Date(mfgDate),
      expDate: new Date(expDate)
    });
    res.redirect("/expiredProducts");
  } catch (err) {
    console.error("Error updating expired product:", err);
  }
});

// EXPIRED ROUTE ENDS HERE ----------------- TECH MAYOR GROUPS

// LOW STOCK ROUTE STARTS HERE

router.get(
  "/lowStock",
  checkPermission("view-low-stocks"), // adjust permission name if needed
  async (req, res) => {
    try {
      const user = req.user;
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      // Helper: fetch low stock & out of stock products for a branch
      const getStockData = async (branchId) => {
        let lowStockProducts = await Product.aggregate([
          { $match: { branch: new mongoose.Types.ObjectId(branchId) } },
          {
            $addFields: {
              hasLowStock: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$variants",
                        as: "v",
                        cond: { $lte: ["$$v.quantity", "$$v.lowStockAlert"] }
                      }
                    }
                  },
                  0
                ]
              }
            }
          },
          { $match: { hasLowStock: true } }
        ]);

        let outOfStockProducts = await Product.aggregate([
          { $match: { branch: new mongoose.Types.ObjectId(branchId) } },
          {
            $addFields: {
              totalVariants: { $size: "$variants" },
              zeroVariantsCount: {
                $size: {
                  $filter: {
                    input: "$variants",
                    as: "v",
                    cond: { $lte: ["$$v.quantity", 0] }
                  }
                }
              }
            }
          },
          { $match: { $expr: { $eq: ["$totalVariants", "$zeroVariantsCount"] } } }
        ]);

        // Populate results
        lowStockProducts = await Product.populate(lowStockProducts, [
          { path: "branch" },
          { path: "category" },
          { path: "variants.supplier" }
        ]);
        outOfStockProducts = await Product.populate(outOfStockProducts, [
          { path: "branch" },
          { path: "category" },
          { path: "variants.supplier" }
        ]);

        return { lowStockProducts, outOfStockProducts };
      };

      // Fetch stock data
      const { lowStockProducts, outOfStockProducts } = await getStockData(selectedBranchId);

      // Notifications
      const branchName =
        user.role.name.toLowerCase() === "owner"
          ? req.allBranches.find(b => b._id.equals(selectedBranchId))?.branch_name
          : user.branch.branch_name;

      const createNotification = async (type, count) => {
        const pageLink = `/lowStock?branchId=${selectedBranchId}`;
        const exists = await Notification.findOne({
          type,
          pageLink,
          isDismissed: false
        });
        if (!exists) {
          await Notification.create({
            title: type === "lowStock" ? "Low Stock Alert" : "Out of Stock Alert",
            description: `There ${count === 1 ? "is" : "are"} ${count} ${
              type === "lowStock" ? "low stock" : "completely out of stock"
            } product(s) at branch ${branchName}.`,
            type,
            pageLink,
            branch: selectedBranchId
          });
        }
      };

      if (lowStockProducts.length > 0) {
        await createNotification("lowStock", lowStockProducts.length);
      }
      if (outOfStockProducts.length > 0) {
        await createNotification("outOfStock", outOfStockProducts.length);
      }

      // Render view
      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );
        return res.render("LowStock/low-stock", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          lowStockProducts,
          outOfStockProducts
        });
      } else {
        return res.render("LowStock/low-stock", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          lowStockProducts,
          outOfStockProducts
        });
      }
    } catch (err) {
      console.error("Error loading low stock:", err);
      res.redirect("/error-404");
    }
  }
);



// LOW STOCK ROUTE ENDS HERE ----------------- TECH MAYOR GROUPS

// EXPENSE ROUTE STARTS HERE

router.get(
  "/expense",
  checkPermission("view-expenses"), // adjust permission name if needed
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    try {
      const user = req.user; // from middleware
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      // Fetch expenses and categories for the selected branch
      const [expenses, expenseCategories] = await Promise.all([
        Expense.find({ branch: selectedBranchId })
          .populate("branch")
          .populate("category"),
        ExpenseCategory.find({})
      ]);

      if (user.role.name.toLowerCase() === "owner") {
        const selectedBranchDoc = req.allBranches.find(b =>
          b._id.equals(selectedBranchId)
        );

        return res.render("Expense/expense", {
          user,
          ownerBranch: { branch: selectedBranchDoc },
          branches: req.allBranches,
          selectedBranchId,
          expenses,
          expenseCategories
        });
      } else {
        return res.render("Expense/expense", {
          user,
          ownerBranch: { branch: user.branch },
          branches: [user.branch],
          selectedBranchId,
          expenses,
          expenseCategories
        });
      }
    } catch (err) {
      console.error("Error loading expense page:", err);
      res.redirect("/error-404");
    }
  }
);



router.get("/expense-category", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      if (user.role === "owner") {
        // Owner: fetch all branches
        Branch.findById(user.branch)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => {
                ExpenseCategory.find({})
                  .then(expenseCategories => {
                    res.render("Expense/expense-category", {
                      user,
                      ownerBranch: { branch: ownerBranch },
                      branches: allBranches, // ✅ Pass branches
                      expenseCategories
                    });
                  })
                  .catch(err => {
                    console.error("Error fetching expense categories:", err);
                    res.redirect("/error-404");
                  });
              })
              .catch(err => {
                console.error("Error fetching branches:", err);
                res.redirect("/error-404");
              });
          })
          .catch(err => {
            console.error("Error fetching owner branch:", err);
            res.redirect("/error-404");
          });

      } else {
        // Non-owner: pass only their branch
        ExpenseCategory.find({})
          .then(expenseCategories => {
            res.render("Expense/expense-category", {
              user,
              ownerBranch: { branch: user.branch },
              branches: [user.branch], // ✅ Still pass as array
              expenseCategories
            });
          })
          .catch(err => {
            console.error("Error fetching expense categories:", err);
            res.redirect("/error-404");
          });
      }
    })
    .catch(err => {
      console.error("Error fetching user:", err);
      res.redirect("/error-404");
    });
});


router.post("/addExpenseCategory", (req, res) => {
  const { name, description } = req.body;
  const userId = req.user?._id;

  if (!name) {
    return res.status(400).json({ error: "Store name and branch are required" });
  }

  ExpenseCategory.findOne({ name })
    .then(existing => {
      if (existing) {
        return res.status(409).json({ error: "Expense category name already exists for this branch" });
      }

      return ExpenseCategory.create({
        name,
        description,
        created_by: userId
      });
    })
    .then(newCategory => {
      res.redirect("/expense-category")
    })
    .catch(err => {
      console.error("Error creating parking store:", err);
      res.status(500).json({ error: "Internal server error" });
    });
});


router.post("/addExpense", checkPermission("add-expenses"), async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  const { title, description, category, date, amount } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.redirect('/');

    const newExpense = new Expense({
      title,
      description,
      category,
      date,
      amount,
      branch: user.branch,
      created_by: user._id // track who created the expense
    });

    await newExpense.save();
    res.redirect('/expense');
  } catch (err) {
    console.error("Error adding expense:", err);
    res.status(500).send("Internal Server Error");
  }
});



// Update Expense
router.post('/updateExpense', async (req, res, next) => {
  try {
    const { expenseId, title, description, category, date, amount } = req.body;
    const operator = req.user?._id;
    const branch = req.user?.branch;

    if (!expenseId) return res.status(400).send('Missing expense ID');

    // Find the existing expense
    const existingExpense = await Expense.findById(expenseId);
    if (!existingExpense) return res.status(404).send('Expense not found');

    // Update the expense
    await Expense.findByIdAndUpdate(expenseId, { title, description, category, date, amount });

    // Create ActionLog
    await ActionLog.create({
      action: 'edit',
      operator,
      branch,
      particulars: `Updated expense: ${title || existingExpense.title} - Amount: ${amount || existingExpense.amount}`,
      targetModel: 'Expense',
      targetId: expenseId
    });

    res.redirect('/expense');
  } catch (err) {
    console.error('Update failed:', err);
    next(err);
  }
});


// Delete Expense
router.post('/deleteExpense', async (req, res, next) => {
  try {
    const { expenseId } = req.body;
    const operator = req.user?._id;
    const branch = req.user?.branch;

    if (!expenseId) return res.status(400).send('Missing expense ID');

    const expense = await Expense.findById(expenseId);
    if (!expense) return res.status(404).send('Expense not found');

    await Expense.findByIdAndDelete(expenseId);

    await ActionLog.create({
      action: 'delete',
      operator,
      branch,
      particulars: `Deleted expense: ${expense.description || expense.title || 'No description'} - Amount: ${expense.amount}`,      targetModel: 'Expense',
      targetId: expense._id
    });

    res.redirect('/expense');
  } catch (err) {
    console.error('Delete failed:', err);
    next(err);
  }
});


router.post('/updateExpenseCategory', (req, res) => {
  const { categoryId, name, description } = req.body;

  ExpenseCategory.findByIdAndUpdate(categoryId, { name, description })
    .then(() => res.redirect('/expense-category'))
    .catch(err => {
      console.error('Update failed:', err);
      res.status(500).send('Failed to update category.');
    });
});

router.post('/deleteExpenseCategory', (req, res) => {
  ExpenseCategory.findByIdAndDelete(req.body.categoryId)
    .then(() => res.redirect('/expense-category'))
    .catch(err => {
      console.error('Delete failed:', err);
      res.status(500).send('Failed to delete category.');
    });
});
// EXPENSE ROUTE ENDS HERE ----------------- TECH MAYOR GROUPS

// TRANSACTIONS ROUTE STARTS HERE
router.get(
  "/transactions",
  checkPermission("view-payments"),
  async (req, res) => {
    try {
      const user = req.user; // from middleware
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.selectedBranchId
          : user.branch._id;

      // Fetch owner branch document if user is owner
      const ownerBranch =
        user.role.name.toLowerCase() === "owner"
          ? req.allBranches.find(b => b._id.equals(selectedBranchId))
          : user.branch;

      // Fetch customers, loans, and transactions for selected branch
      const [customers, loans, transactionsRaw] = await Promise.all([
        Customer.find({ branch: selectedBranchId }),
        Loan.find({ branch: selectedBranchId }),
        Transaction.find({ branch: selectedBranchId })
          .sort({ paymentDate: -1 })
          .populate("userId")
      ]);

      // Format currency helper
      const formatCurrency = (amount) =>
        new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: "NGN",
          minimumFractionDigits: 0
        }).format(amount);

      // Format transactions with userName and currency
      const transactions = transactionsRaw.map((tx) => {
        const userName =
          tx.transactionType === "Customer"
            ? tx.userId?.customer_name
            : tx.userId?.loaner;

        return {
          ...tx.toObject(),
          userName,
          expectedAmountFormatted: formatCurrency(tx.expectedAmount),
          amountReceivedFormatted: formatCurrency(tx.amountReceived),
          balanceRemainingFormatted: formatCurrency(tx.balanceRemaining)
        };
      });

      res.render("Transaction/transaction", {
        user,
        ownerBranch: { branch: ownerBranch },
        branches: user.role.name.toLowerCase() === "owner" ? req.allBranches : [user.branch],
        selectedBranchId,
        customers,
        loans,
        transactions
      });
    } catch (err) {
      console.error("Error in /transactions route:", err);
      res.redirect("/error-404");
    }
  }
);


router.get("/searchClient", async (req, res) => {
  const { q, type } = req.query;
  const regex = new RegExp(q, 'i');

  try {
    if (type.toLowerCase() === 'customer') {
      const customers = await Customer.find({ customer_name: regex }).limit(10);
      return res.json(customers.map(c => ({
        _id: c._id,
        name: c.customer_name,
        balance: c.remaining_amount || 0
      })));
    } 
    
    if (type.toLowerCase() === 'loan') {
      const loans = await Loan.find({ loaner: regex }).limit(10);
      return res.json(loans.map(loan => ({
        _id: loan._id,
        name: loan.loaner,
        balance: loan.loans.reduce((sum, l) => sum + l.amount_to_repay, 0)
      })));
    }

    res.json([]);
  } catch (err) {
    console.error("Error in /searchClient:", err);
    res.status(500).json({ error: 'Server error' });
  }
});







// TRANSACTION ENDS HERE ----------------- TECH MAYOR GROUPS


// REPORTS ROUTE STARTS HERE
router.get(
  "/sales-report",
  checkPermission("sales-report"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role"); // ensure role is loaded for middleware and owner checks

      if (!user) return res.redirect("/");

      const branchId = user.branch._id || user.branch;

      // Get filters from query
      const { startDate, endDate, salesType } = req.query;

      let salesLedgers = []; // default empty table

      // Only query if date range provided
      if (startDate && endDate) {
        const filter = {
          branch: branchId,
          sale_date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        };

        if (salesType && salesType !== "all") {
          filter.sales_type = salesType; // 'cash' or 'credit'
        }

        salesLedgers = await SalesLedger.find(filter)
          .populate("product")
          .populate("customer")
          .populate("operator")
          .sort({ sale_date: -1 });
      }

      // Totals calculation
      let totalAmount = 0;
      let totalCash = 0;
      let totalCredit = 0;

      salesLedgers.forEach(sale => {
        const amount = Number(sale.amount) || 0;
        totalAmount += amount;

        if (sale.sales_type === "cash") {
          totalCash += amount;
        } else {
          totalCredit += amount;
        }
      });

      const renderData = {
        user,
        salesLedgers,
        totalAmount,
        totalCash,
        totalCredit,
        filters: { startDate, endDate, salesType }
      };

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ]);
        renderData.ownerBranch = { branch: ownerBranch };
        renderData.branches = allBranches;
      } else {
        renderData.ownerBranch = { branch: user.branch };
      }

      res.render("Report/Sales/sales-report", renderData);
    } catch (err) {
      console.error("Error loading sales-report:", err);
      res.redirect("/error-404");
    }
  }
);

router.get(
  "/expense-report",
  checkPermission("expense-report"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      const branchId = user.branch._id || user.branch;

      const { startDate, endDate, salesType } = req.query;

      let salesLedgers = [];

      if (startDate && endDate) {
        const filter = {
          branch: branchId,
          sale_date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        };

        if (salesType && salesType !== "all") {
          filter.sales_type = salesType;
        }

        salesLedgers = await SalesLedger.find(filter)
          .populate("product")
          .populate("customer")
          .populate("operator")
          .sort({ sale_date: -1 });
      }

      let totalAmount = 0,
        totalCash = 0,
        totalCredit = 0;

      salesLedgers.forEach((sale) => {
        const amount = Number(sale.amount) || 0;
        totalAmount += amount;

        if (sale.sales_type === "cash") {
          totalCash += amount;
        } else {
          totalCredit += amount;
        }
      });

      const renderData = {
        user,
        salesLedgers,
        totalAmount,
        totalCash,
        totalCredit,
        filters: { startDate, endDate, salesType },
      };

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find(),
        ]);
        renderData.ownerBranch = { branch: ownerBranch };
        renderData.branches = allBranches;
      } else {
        renderData.ownerBranch = { branch: user.branch };
      }

      res.render("Report/Expense/expense-report", renderData);
    } catch (err) {
      console.error("Error loading expense-report:", err);
      res.redirect("/error-404");
    }
  }
);

router.get("/sales-report-summary", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const branchId = user.branch._id || user.branch;

    // Get filters from query
    const { startDate, endDate, salesType } = req.query;

    let salesLedgers = [];   // default: empty (table hidden)

    // Only query if date range provided
    if (startDate && endDate) {
      // Build dynamic filter
      const filter = {
        branch: branchId,
        sale_date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };

      if (salesType && salesType !== 'all') {
        filter.sales_type = salesType;  // 'cash' or 'credit'
      }

      salesLedgers = await SalesLedger.find(filter)
        .populate("product")
        .populate("customer")
        .populate("operator")
        .sort({ sale_date: -1 });
    }

    // Totals logic
    let totalAmount = 0;
    let totalCash = 0;
    let totalCredit = 0;

    salesLedgers.forEach(sale => {
      const amount = Number(sale.amount) || 0;
      totalAmount += amount;

      if (sale.sales_type === 'cash') {
        totalCash += amount;
      } else {
        totalCredit += amount;
      }
    });

    const renderData = {
      user,
      salesLedgers,
      totalAmount,
      totalCash,
      totalCredit,
      filters: { startDate, endDate, salesType }
    };

    if (user.role === "owner") {
      const ownerBranch = await Branch.findById(branchId);
      const allBranches = await Branch.find();
      renderData.ownerBranch = { branch: ownerBranch };
      renderData.branches = allBranches;
    } else {
      renderData.ownerBranch = { branch: user.branch };
    }

    res.render("Report/Sales/summary-report", renderData);
  } catch (err) {
    console.error("Error loading sales-report:", err);
    res.redirect("/error-404");
  }
});


router.get("/sales-report-summaryt", (req, res) => {
  if (req.isAuthenticated()) {
    User.findById(req.user._id)
      .populate("branch")
      .then(user => {
        if (!user) return res.redirect("/");

        if (user.role === 'owner') {
          Branch.findById(user.branch)
            .then(ownerBranch => {
              Branch.find()
                .then(allBranches => {
                  res.render("Report/Sales/summary-report", {
                    user: user,
                    ownerBranch: { branch: ownerBranch },
                    branches: allBranches
                  });
                })
                .catch(err => {
                  console.error(err);
                  res.redirect('/error-404');
                });
            })
            .catch(err => {
              console.error(err);
              res.redirect('/error-404');
            });
        } else {
          res.render("Report/Sales/summary-report", {
            user: user,
            ownerBranch: { branch: user.branch }
          });
        }
      })
      .catch(err => {
        console.error(err);
        res.redirect("/error-404");
      });
  } else {
    res.redirect("/");
  }
});

router.get(
  "/customer-report",
  checkPermission("customer-report"),
  async (req, res) => {
    try {
      const { customerId, startDate, endDate } = req.query;
      const query = customerId ? { customer: customerId } : null;

      if (startDate && endDate && query) {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");
      if (!user) return res.redirect("/");

      const renderView = async (ownerBranch, branches = []) => {
        try {
          const entries = query
            ? await CustomerLedger.find(query)
                .populate("customer", "customer_name")
                .populate("branch", "branch_name")
                .sort({ date: 1 })
            : [];

          res.render("Report/Customer/customer-report", {
            user,
            ownerBranch: { branch: ownerBranch },
            branches,
            entries,
            startDate,
            endDate,
            customerId,
          });
        } catch (err) {
          console.error("Ledger Report Error:", err);
          res.render("Report/Customer/customer-report", {
            user,
            ownerBranch: { branch: ownerBranch },
            branches,
            entries: [],
            startDate,
            endDate,
            customerId,
            error: "Error retrieving ledger data",
          });
        }
      };

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(user.branch),
          Branch.find(),
        ]);
        await renderView(ownerBranch, allBranches);
      } else {
        await renderView(user.branch);
      }
    } catch (err) {
      console.error(err);
      res.redirect("/error-404");
    }
  }
);

router.get(
  "/stock-report",
  checkPermission("stock-report"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role"); // ensure owner check works

      if (!user) return res.redirect("/");

      const { productId, startDate, endDate } = req.query;
      const branchId = user.branch._id;
      const filters = { productId, startDate, endDate };

      const stockQuery = { branch: branchId };

      if (productId) {
        stockQuery.product = productId;
      }

      if (startDate || endDate) {
        stockQuery.date = {};
        if (startDate) stockQuery.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          stockQuery.date.$lte = end;
        }
      }

      const stockLedgers = await StockLedger.find(stockQuery)
        .populate("product")
        .populate("branch", "branch_name")
        .populate("operator", "fullname")
        .sort({ createdAt: 1 });

      console.log("StockLedgers found:", stockLedgers.length);
      console.log(
        stockLedgers.map(l => ({
          stock_ID: l.stock_ID,
          particular: l.particular,
          date: l.date
        }))
      );

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ]);

        return res.render("Report/Stock/stock-report", {
          user,
          ownerBranch: { branch: ownerBranch },
          branches: allBranches,
          stockLedgers: productId ? stockLedgers : undefined,
          filters
        });
      }

      res.render("Report/Stock/stock-report", {
        user,
        ownerBranch: { branch: user.branch },
        stockLedgers: productId ? stockLedgers : undefined,
        filters
      });
    } catch (err) {
      console.error(err);
      res.redirect("/error-404");
    }
  }
);


router.get('/api/products/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const branchId = req.query.branchId;

    const filter = {
      product: { $regex: query, $options: 'i' }
    };

    if (branchId) {
      filter.branch = branchId;
    }

    const products = await Product.find(filter).select('_id product');
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});


router.get(
  "/sold-stock-report",
  checkPermission("sold-stock"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      const { productId, startDate, endDate } = req.query;
      const branchId = user.branch._id;

      const filters = { productId, startDate, endDate };

      const stockQuery = { branch: branchId };

      if (productId) {
        stockQuery.product = productId;
      }

      if (startDate || endDate) {
        stockQuery.date = {};
        if (startDate) stockQuery.date.$gte = new Date(startDate);
        if (endDate) stockQuery.date.$lte = new Date(endDate);
      }

      const stockLedgers = await StockLedger.find(stockQuery)
        .populate("product")
        .populate("branch", "branch_name")
        .populate("operator", "fullname")
        .sort({ date: 1 });

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ]);

        return res.render("Report/Stock/sold-stock", {
          user,
          ownerBranch: { branch: ownerBranch },
          branches: allBranches,
          stockLedgers: productId ? stockLedgers : undefined,
          filters
        });
      }

      res.render("Report/Stock/sold-stock", {
        user,
        ownerBranch: { branch: user.branch },
        stockLedgers: productId ? stockLedgers : undefined,
        filters
      });
    } catch (err) {
      console.error(err);
      res.redirect("/error-404");
    }
  }
);

router.get(
  "/parking-stock-report",
  checkPermission("parking-stock-report"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      const branchId = user.branch._id;
      const { productId, parkingStoreId, startDate, endDate } = req.query;

      const filters = { productId, parkingStoreId, startDate, endDate };

      const ledgerQuery = { branch: branchId };

      if (productId) {
        ledgerQuery.product = productId;
      }

      if (parkingStoreId) {
        ledgerQuery.parkingStore = parkingStoreId;
      }

      if (startDate || endDate) {
        ledgerQuery.date = {};
        if (startDate) ledgerQuery.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          ledgerQuery.date.$lte = end;
        }
      }

      const [parkingStockLedgers, parkingStores, products] = await Promise.all([
        ParkingStockLedger.find(ledgerQuery)
          .populate("product")
          .populate("parkingStore", "storeName")
          .populate("branch", "branch_name")
          .populate("operator", "fullname")
          .sort({ createdAt: 1 }),
        ParkingStore.find({ branch: branchId }),
        Product.find({ branch: branchId })
      ]);

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ]);

        return res.render("Report/Stock/parking-stock-report", {
          user,
          ownerBranch: { branch: ownerBranch },
          branches: allBranches,
          parkingStockLedgers:
            productId || parkingStoreId ? parkingStockLedgers : undefined,
          parkingStores,
          products,
          filters
        });
      }

      res.render("Report/Stock/parking-stock-report", {
        user,
        ownerBranch: { branch: user.branch },
        parkingStockLedgers:
          productId || parkingStoreId ? parkingStockLedgers : undefined,
        parkingStores,
        products,
        filters
      });
    } catch (err) {
      console.error(err);
      res.redirect("/error-404");
    }
  }
);


router.get(
  "/purchase-report",
  checkPermission("purchase-report"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role"); // ensure role is loaded for middleware + owner checks

      if (!user) return res.redirect("/");

      const branchId = user.branch._id || user.branch;
      const { supplierID, supplier, startDate, endDate } = req.query;

      let purchaseReports = []; // default empty
      const filters = { supplier, supplierID, startDate, endDate }; // keep for form

      if (startDate || endDate || supplier || supplierID) {
        const filter = { branch: branchId };

        if (startDate || endDate) {
          filter.payment_date = {};
          if (startDate) filter.payment_date.$gte = new Date(startDate);
          if (endDate) filter.payment_date.$lte = new Date(endDate);
        }

        if (supplierID) {
          filter.supplier = supplierID;
        } else if (supplier) {
          const supplierDoc = await Supplier.findOne({
            supplier: { $regex: supplier, $options: "i" }
          });
          if (supplierDoc) {
            filter.supplier = supplierDoc._id;
          } else {
            return res.render("Report/Purchase/purchase-report", {
              user,
              purchaseReports,
              filters,
              ownerBranch: { branch: user.branch }
            });
          }
        }

        purchaseReports = await ReceivedStock.find(filter)
          .populate("supplier")
          .populate("items.product")
          .sort({ payment_date: -1 });
      }

      const renderData = { user, purchaseReports, filters };

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ]);
        renderData.ownerBranch = { branch: ownerBranch };
        renderData.branches = allBranches;
      } else {
        renderData.ownerBranch = { branch: user.branch };
      }

      res.render("Report/Purchase/purchase-report", renderData);
    } catch (err) {
      console.error("Error loading purchase-report:", err);
      res.redirect("/error-404");
    }
  }
);


router.get(
  "/supplier-report",
  checkPermission("supplier-report"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user) return res.redirect("/");

      const branchId = user.branch._id || user.branch;
      const { supplierID, supplier, startDate, endDate } = req.query;

      let supplierReports = [];
      const filters = { supplier, supplierID, startDate, endDate };

      if (startDate || endDate || supplier || supplierID) {
        const filter = { branch: branchId };

        if (startDate || endDate) {
          filter.date = {};
          if (startDate) filter.date.$gte = new Date(startDate);
          if (endDate) filter.date.$lte = new Date(endDate);
        }

        if (supplierID) {
          filter.supplier = supplierID;
        } else if (supplier) {
          const supplierDoc = await Supplier.findOne({
            supplier: { $regex: supplier, $options: "i" }
          });
          if (supplierDoc) {
            filter.supplier = supplierDoc._id;
          } else {
            // supplier not found → return empty
            return res.render("Report/Supplier/supplier-report", {
              user,
              supplierReports,
              filters,
              ownerBranch: { branch: user.branch }
            });
          }
        }

        supplierReports = await SupplierLedger.find(filter)
          .populate("supplier")
          .sort({ date: 1, createdAt: 1 });
      }

      const renderData = { user, supplierReports, filters };

      if (user.role?.name === "owner") {
        const [ownerBranch, allBranches] = await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ]);
        renderData.ownerBranch = { branch: ownerBranch };
        renderData.branches = allBranches;
      } else {
        renderData.ownerBranch = { branch: user.branch };
      }

      res.render("Report/Supplier/supplier-report", renderData);
    } catch (err) {
      console.error("Error loading supplier-report:", err);
      res.redirect("/error-404");
    }
  }
);




router.get('/api/suppliers/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const suppliers = await Supplier.find({
      supplier: { $regex: q, $options: 'i' }
    }).limit(10); // limit results for performance

    res.json(suppliers);
  } catch (err) {
    console.error('Error searching suppliers:', err);
    res.status(500).json([]);
  }
});



// LOGS STARTS HERE 
router.get(
  "/view-log",
  checkPermission("view-log"), // ✅ uses your middleware
  async (req, res) => {
    try {
      const currentSort = req.query.sort || "recently";
      const user = req.user; // ✅ already populated by middleware

      let branchesToUse;
      let selectedBranchId;
      let ownerBranch;

      if (user.role.name.toLowerCase() === "owner") {
        branchesToUse = req.allBranches;
        selectedBranchId = req.selectedBranchId;

        ownerBranch = branchesToUse.find(b =>
          b._id.equals(selectedBranchId)
        );
      } else {
        branchesToUse = [user.branch];
        selectedBranchId = user.branch._id;
        ownerBranch = user.branch;
      }

      // Sorting
      let sortQuery = { date: -1 };
      if (currentSort === "ascending") sortQuery = { date: 1 };

      // Date filtering
      let logQuery = { branch: selectedBranchId };
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (currentSort === "today") {
        logQuery.date = { $gte: today };
      } else if (currentSort === "lastMonth") {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        lastMonth.setHours(0, 0, 0, 0);
        logQuery.date = { $gte: lastMonth };
      } else if (currentSort === "last7days") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        logQuery.date = { $gte: sevenDaysAgo };
      }

      // Fetch logs
      const logs = await ActionLog.find(logQuery)
        .populate("operator", "fullname email")
        .sort(sortQuery);

      res.render("Log/logs", {
        user,
        ownerBranch: { branch: ownerBranch },
        branches: branchesToUse,
        selectedBranchId,
        currentSort,
        logs,
        moment
      });
    } catch (err) {
      console.error("Error fetching logs:", err);
      res.redirect("/error-404");
    }
  }
);




router.post('/delete-log', async (req, res, next) => {
  try {
    const { logId } = req.body;
    if (!logId) return res.status(400).send('Missing logId');

    await ActionLog.findByIdAndDelete(logId);

    res.redirect('/view-log');
  } catch (err) {
    console.error('Error deleting log:', err);
    next(err);
  }
});

router.get("/role-permissions", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;

  User.findById(req.user._id)
    .populate("branch role") // populate both branch & role
    .then(user => {
      if (!user) return res.redirect("/");

      const renderRolePermissionsPage = (branchList, ownerBranch, selectedBranchIdToUse) => {
        Role.find()
          .then(roles => {
            res.render("Role/role-permissions", {
              user,
              ownerBranch: { branch: ownerBranch },
              branches: branchList,
              selectedBranchId: selectedBranchIdToUse,
              roles
            });
          })
          .catch(err => {
            console.error("Error fetching roles:", err);
            res.redirect("/error-404");
          });
      };

      if (user.role.name === 'owner') {
        Branch.find()
          .then(allBranches => {
            const branchToUse = selectedBranchId || user.branch._id;

            // Find the actual selected branch document
            const selectedBranchDoc = allBranches.find(b => b._id.equals(branchToUse));

            renderRolePermissionsPage(allBranches, selectedBranchDoc, branchToUse);
          })
          .catch(err => {
            console.error(err);
            res.redirect("/error-404");
          });
      } else {
        // Staff/Admin: only own branch
        renderRolePermissionsPage([user.branch], user.branch, user.branch._id);
      }
    })
    .catch(err => {
      console.error(err);
      res.redirect("/error-404");
    });
});

// Create role
router.post("/create-roles", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === "") {
      req.flash("error", "Role name is required");
      return res.redirect("back");
    }

    const roleExists = await Role.findOne({ name: name.trim() });
    if (roleExists) {
      return res.redirect("back");
    }

    await Role.create({
      name: name.trim(),
      permissions: []
    });

    res.redirect("/role-permissions");
  } catch (err) {
    console.error(err);
    res.redirect("/role-permissions");
  }
});




router.get("/permissions/:roleId", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;
  const roleId = req.params.roleId; // ✅ role ID from URL

  try {
    const user = await User.findById(req.user._id).populate("branch role");
    if (!user) return res.redirect("/");

    // ✅ Fetch the role to edit
    const targetRole = await Role.findById(roleId);
    if (!targetRole) return res.redirect("/error-404");

    const allPermissions = await Permission.find().sort({ module: 1, name: 1 });

    const renderPermissionsPage = (branchList, ownerBranch, selectedBranchIdToUse) => {
      res.render("Role/permissions", {
        user,
        role: targetRole, // 👈 pass the role being edited
        ownerBranch: { branch: ownerBranch },
        branches: branchList,
        selectedBranchId: selectedBranchIdToUse,
        permissions: allPermissions,
      });
    };

    if (user.role.name === "owner") {
      const allBranches = await Branch.find();
      const branchToUse = selectedBranchId || user.branch._id;
      const selectedBranchDoc = allBranches.find((b) => b._id.equals(branchToUse));
      renderPermissionsPage(allBranches, selectedBranchDoc, branchToUse);
    } else {
      renderPermissionsPage([user.branch], user.branch, user.branch._id);
    }
  } catch (err) {
    console.error(err);
    res.redirect("/error-404");
  }
});

router.post("/roles/:roleId/permissions", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const roleId = req.params.roleId;

    // Get permissions from form (will be an array or undefined)
    let permissions = req.body.permissions || [];

    // Ensure permissions is always an array
    if (!Array.isArray(permissions)) {
      permissions = [permissions];
    }

    // Update the role in DB
    await Role.findByIdAndUpdate(roleId, { permissions });

    req.flash("success", "Permissions updated successfully.");
    res.redirect(`/permissions/${roleId}`); // redirect back to permissions page
  } catch (err) {
    console.error("Error updating role permissions:", err);
    req.flash("error", "Failed to update permissions.");
    res.redirect("/error-404");
  }
});

router.get(
  "/close-account",
  checkPermission("view-close-account"),
  async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    try {
      const user = req.user;

      // Determine branch
      const selectedBranchId =
        user.role.name.toLowerCase() === "owner"
          ? req.query.branch || req.selectedBranchId
          : user.branch._id;

      const ownerBranch =
        user.role.name.toLowerCase() === "owner"
          ? req.allBranches.find((b) => b._id.equals(selectedBranchId))
          : user.branch;

      // Get optional date filters
      const { startDate, endDate } = req.query;

      let filter = { branch: selectedBranchId };

      // Only apply date filter if both start and end are provided
      let showResults = false;
      if (startDate && endDate) {
        showResults = true;
        filter.date = {
          $gte: new Date(Date.UTC(new Date(startDate).getUTCFullYear(), new Date(startDate).getUTCMonth(), new Date(startDate).getUTCDate())),
          $lt: new Date(Date.UTC(new Date(endDate).getUTCFullYear(), new Date(endDate).getUTCMonth(), new Date(endDate).getUTCDate() + 1)),
        };
      }

      // Fetch closing accounts only if searching
      const closingAccounts = showResults
        ? await ClosingAccount.find(filter).lean()
        : [];

      res.render("User/close-account", {
        user,
        ownerBranch: { branch: ownerBranch },
        branches:
          user.role.name.toLowerCase() === "owner"
            ? req.allBranches
            : [user.branch],
        selectedBranchId,
        closingAccounts,
        query: { startDate, endDate },
        showResults, // this flag tells the template whether to render the table
      });
    } catch (err) {
      console.error("Error loading close-account page:", err);
      res.redirect("/error-404");
    }
  }
);


router.post('/close-account', async (req, res) => {
  try {
    const { payment_date } = req.body;

    // 1) Branch from logged-in user (ensure your auth middleware sets req.user)
    const branchId = req.user?.branch;
    if (!branchId) {
      return res.status(403).json({ message: 'User does not have a branch assigned.' });
    }

    // 2) Normalize to DAY (UTC) to match stored dates reliably
    if (!payment_date) {
      return res.status(400).json({ message: 'payment_date is required' });
    }
    const inDate = new Date(payment_date); // "YYYY-MM-DD" parses as UTC midnight
    const start = new Date(Date.UTC(inDate.getUTCFullYear(), inDate.getUTCMonth(), inDate.getUTCDate()));
    const end = new Date(Date.UTC(inDate.getUTCFullYear(), inDate.getUTCMonth(), inDate.getUTCDate() + 1));

    // 3) Block duplicates (branch + date). Also add a unique index {branch:1, date:1} in schema.
    const existing = await ClosingAccount.findOne({
      branch: new mongoose.Types.ObjectId(branchId),
      date: start
    });
    if (existing) {
      return res.status(400).json({ message: 'Account already closed for this date.' });
    }

    // 4) INVOICES: single pass to get cash, credit, and total sales
    const invoiceAgg = await Invoice.aggregate([
      {
        $match: {
          branch: new mongoose.Types.ObjectId(branchId),
          payment_date: { $gte: start, $lt: end }
        }
      },
      {
        $group: {
          _id: null,
          cashSales: {
            $sum: {
              $cond: [{ $eq: ['$sales_type', 'cash'] }, '$grand_total', 0]
            }
          },
          creditSalesPos: {
            $sum: {
              $cond: [{ $eq: ['$sales_type', 'credit'] }, '$grand_total', 0]
            }
          },
          totalSalesAll: { $sum: '$grand_total' } // cash + credit
        }
      }
    ]);

    const cashSales = invoiceAgg[0]?.cashSales || 0;
    const creditSalesPos = invoiceAgg[0]?.creditSalesPos || 0;        // positive number
    const totalSales = invoiceAgg[0]?.totalSalesAll || 0;              // ALL sales (cash + credit)
    const totalCreditSales = -creditSalesPos;                          // store as negative per your convention

    // 5) TRANSACTIONS: customer debtor payments (money collected)
    const debtorAgg = await Transaction.aggregate([
      {
        $match: {
          transactionType: 'Customer',
          branch: new mongoose.Types.ObjectId(branchId),
          paymentDate: { $gte: start, $lt: end }
        }
      },
      { $group: { _id: null, total: { $sum: '$amountReceived' } } }
    ]);
    const totalDebtorsPayment = debtorAgg[0]?.total || 0;

    // 6) EXPENSES
    const expenseAgg = await Expense.aggregate([
      {
        $match: {
          branch: new mongoose.Types.ObjectId(branchId),
          date: { $gte: start, $lt: end }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalExpenses = expenseAgg[0]?.total || 0;

    // 7) BALANCES (note: totalCreditSales is negative)
    const balance = totalSales + totalDebtorsPayment + totalCreditSales; // => cashSales + debtorPayments
    const closingBalance = balance - totalExpenses;

    // 8) SAVE snapshot
    const closingAccount = new ClosingAccount({
      branch: new mongoose.Types.ObjectId(branchId),
      date: start, // normalized day
      totalSales,
      totalDebtorsPayment,
      totalCreditSales, // negative number
      balance,
      totalExpenses,
      closingBalance
    });

    await closingAccount.save();

    return res.json({ message: 'Account closed successfully', closingAccount });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Account already closed for this branch/date.' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});




// BACKUP 
router.get("/backup", checkPermission("view-backup"), async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("branch")
      .populate("role");

    if (!user) return res.redirect("/");

    const selectedBranchId =
      user.role.name.toLowerCase() === "owner"
        ? req.selectedBranchId
        : user.branch._id;

    // Ensure backup folder exists
    if (!fs.existsSync(backupsFolder)) {
      fs.mkdirSync(backupsFolder, { recursive: true });
    }

    // Read backups log
    const backupsLog = path.join(backupsFolder, "backups.json");
    let backups = [];
    if (fs.existsSync(backupsLog)) {
      backups = JSON.parse(fs.readFileSync(backupsLog));
    }

    if (user.role.name.toLowerCase() === "owner") {
      const selectedBranchDoc = req.allBranches.find(b =>
        b._id.equals(selectedBranchId)
      );
      return res.render("Log/backup", {
        user,
        ownerBranch: { branch: selectedBranchDoc },
        branches: req.allBranches,
        selectedBranchId,
        backups
      });
    } else {
      return res.render("Log/backup", {
        user,
        ownerBranch: { branch: user.branch },
        branches: [user.branch],
        selectedBranchId,
        backups
      });
    }
  } catch (err) {
    console.error("Error in /backup route:", err);
    res.redirect("/error-404");
  }
});




router.get('/download-backup/:timestamp', (req, res) => {
  const folderName = `backup-${req.params.timestamp}`;
  const backupPath = path.join(backupsFolder, folderName);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).send('Backup not found');
  }

  const zipName = `${folderName}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename=${zipName}`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(backupPath, false);
  archive.finalize();
});



if (!fs.existsSync(backupsFolder)) {
  fs.mkdirSync(backupsFolder);
}

// Route to create backup
router.post('/create-backup', (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `C:\\Users\\TECH MAYOR\\application-backup\\backup-${timestamp}`;

  const mongoDumpPath = `"C:\\Program Files\\MongoDB\\Tools\\mongodb-database-tools-windows-x86_64-100.12.2\\bin\\mongodump.exe"`;

  exec(`${mongoDumpPath} --db ajaliDB --out "${backupPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup error: ${error.message}`);
      console.error(stderr);
      return res.status(500).send('Backup failed');
    }

    console.log(`Backup successful: ${backupPath}`);
    console.log(stdout);

    // Save backup log
    const backupsLog = `C:\\Users\\TECH MAYOR\\application-backup\\backups.json`;
    let backups = [];
    if (fs.existsSync(backupsLog)) {
      backups = JSON.parse(fs.readFileSync(backupsLog));
    }
    backups.push({
      operator: req.user ? req.user.name : 'Unknown',
      createdOn: new Date(),
      path: backupPath,
      timestamp // ✅ Save timestamp for download link
    });
    fs.writeFileSync(backupsLog, JSON.stringify(backups, null, 2));

    res.redirect('/backup');
  });
});




module.exports = router;