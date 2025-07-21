const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path')
const multer = require('multer');
const numberToWords = require('number-to-words');
const mongoose = require("mongoose");



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
router.use(require("../routes/query"))





// ROUTINGS 
router.get("/dashboard", async (req, res) => {
  if (!req.user) return res.redirect("/");

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const branchId = user.branch?._id;
    const selectedBranchId = req.query.branchId || branchId;
    const sortFilter = req.query.sort;

    // 🗓 Build date filter
    let dateFilter = {};
    if (sortFilter === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      dateFilter = { createdAt: { $gte: start, $lte: end } };
    } else if (sortFilter === 'last7days') {
      const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter = { createdAt: { $gte: lastWeek } };
    } else if (sortFilter === 'lastmonth') {
      const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
      dateFilter = { createdAt: { $gte: lastMonth } };
    }

    // 🟩 Fetch all branches
    const allBranches = await Branch.find();

    // 🟩 Find the selected branch doc
    const branchDoc = allBranches.find(b => b._id.equals(selectedBranchId));

    // 🟩 Fetch all dashboard data in parallel
    const [
      totalCustomers,
      totalSuppliers,
      totalProducts,
      topCustomers,
      topCategories,
      recentSales,
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
      topSellingProducts
    ] = await Promise.all([
      Customer.countDocuments({ branch: selectedBranchId }),
      Supplier.countDocuments(),
      Product.countDocuments({ branch: selectedBranchId }),

      Customer.find({ branch: selectedBranchId }).limit(5),
      Category.find({ branch: selectedBranchId }).limit(5),

      Invoice.find({ branch: selectedBranchId, ...dateFilter }).sort({ createdAt: -1 }).limit(5),
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
        {
          $match: {
            branch: new mongoose.Types.ObjectId(selectedBranchId),
            ...(Object.keys(dateFilter).length > 0 ? dateFilter : {})
          }
        },
        { $unwind: "$variants" },
        {
          $match: { $expr: { $lt: ["$variants.quantity", "$variants.lowStockAlert"] } }
        },
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
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), transactionType: "Customer", ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$amountReceived" } } }
      ]),

      Loan.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId) } },
        { $unwind: "$loans" },
        { $group: { _id: null, total: { $sum: "$loans.loanAmount" } } }
      ]),

      Invoice.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(selectedBranchId), ...dateFilter } },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.product",
            foreignField: "_id",
            as: "productInfo"
          }
        },
        { $unwind: "$productInfo" },
        {
          $project: {
            quantity: "$products.quantity",
            sellPrice: "$products.sellPrice",
            supplierPrice: "$productInfo.supplierPrice",
            profitPerItem: { $subtract: ["$products.sellPrice", "$productInfo.supplierPrice"] }
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
        { $unwind: "$products" },
        {
          $group: {
            _id: "$products.product",
            totalSold: { $sum: "$products.quantity" },
            totalAmount: { $sum: { $multiply: ["$products.quantity", "$products.sellPrice"] } }
          }
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.product",
            image: "$product.product_image",
            totalSold: 1,
            totalAmount: 1
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 }
      ])
    ]);

    // 🧮 Compute totals safely
    const totalSales = totalSalesAmount[0]?.total || 0;
    const totalExpenses = totalExpensesAmount[0]?.total || 0;
    const profit = profitData[0]?.totalProfit || 0;

    const dashboardData = {
      totalCustomers,
      totalSuppliers,
      totalProducts,
      topCustomers,
      topCategories,
      recentSales,
      recentPurchases,
      recentExpenses,
      totalSalesAmount: totalSales,
      totalCashSales: totalCashSales[0]?.total || 0,
      totalCreditSales: totalCreditSales[0]?.total || 0,
      totalExpensesAmount: totalExpenses,
      totalStockValue: totalStockValue[0]?.total || 0,
      pendingInvoices,
      allBranches,
      selectedBranchId,
      totalOrders,
      lowStockProducts,
      totalDebtRepayments: totalDebtRepayments[0]?.total || 0,
      totalLoan: totalLoan[0]?.total || 0,
      profit,
      topSellingProducts
    };

    res.render("index", {
      user,
      dashboardData,
      branches: allBranches,
      currentSort: sortFilter,
      selectedBranchId,
      ownerBranch: { branch: branchDoc } // ✅ pass selected branch doc here
    });

  } catch (err) {
    console.error("Error loading dashboard:", err);
    res.status(500).send("Internal Server Error");
  }
});





// CUSTOMER ROUTE
router.get("/customer", (req, res) => {
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

            Customer.find({ branch: branchToFilter })
              .then(customers => {
                res.render("Customer/customer", {
                  user,
                  ownerBranch: { branch: user.branch },
                  branches: allBranches,
                  selectedBranchId: branchToFilter,
                  customers
                });
              })
              .catch(err => {
                console.error("Error fetching customers:", err);
                res.redirect("/error-404");
              });
          });
      } else {
        // Staff/Admin logic - show only their own branch
        Customer.find({ branch: user.branch._id })
          .then(customers => {
            res.render("Customer/customer", {
              user,
              ownerBranch: { branch: user.branch },
              branches: [user.branch],
              selectedBranchId: user.branch._id,
              customers
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

router.get("/delete/customer/:id", (req,res)=>{
  Customer.findByIdAndDelete(req.params.id)
  .then(user =>{
      res.redirect("/customer")
      
  })
  .catch(err => console.log(err))
  
})

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

router.get("/delete/supplier/:id", (req,res)=>{
  Supplier.findByIdAndDelete(req.params.id)
  .then(supplier =>{
      res.redirect("/supplier")
      
  })
  .catch(err => console.log(err))
  
})

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


router.get("/SuppliersInvoice", (req, res) => {
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
                  Supplier.find()
                    .then(suppliers => {
                      SupplierInvoice.find()
                        .populate('supplier')
                        .then(invoices => {
                          res.render("Supplier/supplierInvoice", {
                            user: user,
                            ownerBranch: { branch: ownerBranch },
                            branches: allBranches,
                            suppliers,
                            invoices
                          });
                        })
                        .catch(err => {
                          console.error("Error fetching invoices:", err);
                          res.redirect("/error-404");
                        });
                    })
                    .catch(err => {
                      console.error("Error fetching suppliers:", err);
                      res.redirect("/error-404");
                    });
                })
                .catch(err => {
                  console.error("Error fetching branches:", err);
                  res.redirect('/error-404');
                });
            })
            .catch(err => {
              console.error("Error fetching owner branch:", err);
              res.redirect('/error-404');
            });
        } else {
          Supplier.find()
            .then(suppliers => {
              SupplierInvoice.find()
                .populate('supplier') // optional
                .then(invoices => {
                  res.render("Supplier/supplierInvoice", {
                    user: user,
                    ownerBranch: { branch: user.branch },
                    suppliers,
                    invoices
                  });
                })
                .catch(err => {
                  console.error("Error fetching invoices:", err);
                  res.redirect("/error-404");
                });
            })
            .catch(err => {
              console.error("Error fetching suppliers:", err);
              res.redirect("/error-404");
            });
        }
      })
      .catch(err => {
        console.error("Error fetching user:", err);
        res.redirect("/error-404");
      });
  } else {
    res.redirect("/");
  }
});

router.post('/addinvoiceSuppliers', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const user = await User.findById(req.user._id);
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
      // Debit: increase debt, so balance += amount
      newBalance = prevBalance + amt;
      ledgerAmount = amt;
    } else if (invoice_type === 'credit') {
      // Credit: decrease debt, so balance -= amount
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
});





router.post('/editInvoiceSuppliers', async (req, res) => {
  try {
    const { invoiceId, supplier, invoice_type, amount, payment_date, reason } = req.body;

    const amt = Number(amount);
    const newDate = new Date(payment_date);

    // 1️⃣ Update the invoice
    await SupplierInvoice.updateOne(
      { _id: invoiceId },
      { supplier, invoice_type, amount: amt, payment_date: newDate, reason }
    );

    // 2️⃣ Find the matching ledger entry
    const ledgerEntry = await SupplierLedger.findOne({ refNo: reason, supplier });
    if (!ledgerEntry) return res.status(404).send('Ledger entry not found');

    // 3️⃣ Update the ledger entry fields based on the new type
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

    return res.redirect('/SuppliersInvoice');

  } catch (err) {
    console.error('Edit failed:', err);
    res.status(500).send('Edit failed');
  }
});




router.post('/deleteInvoiceSupplier', (req, res) => {
  SupplierInvoice.findByIdAndDelete(req.body.invoiceId)
    .then(() => res.redirect('/SuppliersInvoice'))
    .catch(err => {
      console.error('Delete failed:', err);
      res.status(500).send('Failed to delete invoice.');
    });
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

    // Only update fields that changed
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
router.get("/delete/loaner/:id", (req,res)=>{
  Loan.findByIdAndDelete(req.params.id)
  .then(supplier =>{
      res.redirect("/loan")
      
  })
  .catch(err => console.log(err))
  
})


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


router.get("/manageLoan", (req, res) => {
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
                  Loan.find()
                    .then(loaners => {
                      res.render("Loan/manageLoan", {
                        user: user,
                        ownerBranch: { branch: ownerBranch },
                        branches: allBranches,
                        loaners
                      });
                    })
                    .catch(err => {
                      console.error("Error fetching categories:", err);
                      res.redirect("/error-404");
                    });
                })
            })
            .catch(err => {
              console.error(err);
              res.redirect('/error-404');
            });
        } else {
         Loan.find()
         .then(loaners => {
          res.render("Loan/manageLoan", {
            user: user,
            ownerBranch: { branch: user.branch },
            loaners
          });
        })
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
      }
    );

    res.redirect('/manageLoan');
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to update loan");
  }
});

router.delete('/deleteLoan/:loanId', async (req, res) => {
  const { loanId } = req.params;

  try {
    await Loan.updateOne(
      { 'loans._id': loanId },
      { $pull: { loans: { _id: loanId } } }
    );
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


// LOAN ROUTE ENDS HERE 

// STOCK ROUTE
router.get("/addProduct", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      if (user.role === 'owner') {
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
                              branches: allBranches,
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
});

router.get("/manageProduct", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      Unit.find().then(units => { // 👈 Fetch units here

        if (user.role === 'owner') {
          Branch.find().then(allBranches => {
            const branchToFilter = selectedBranchId || user.branch._id;

            // 🟩 Find actual selected branch doc
            const selectedBranchDoc = allBranches.find(b => b._id.equals(branchToFilter));

            Product.find({ branch: branchToFilter })
              .populate('category')
              .populate('branch')
              .populate('variants.supplier')
              .then(products => {
                res.render("Product/manageProduct", {
                  user,
                  ownerBranch: { branch: selectedBranchDoc },   // ✅ use actual selected branch
                  branches: allBranches,
                  selectedBranchId: branchToFilter,
                  products,
                  units // ✅ pass units to frontend
                });
              })
              .catch(err => {
                console.error(err);
                res.redirect("/error-404");
              });
          })
          .catch(err => {
            console.error(err);
            res.redirect("/error-404");
          });
        } else {
          Product.find({ branch: user.branch._id })
            .populate('category')
            .populate('branch')
            .populate('variants.supplier')
            .then(products => {
              res.render("Product/manageProduct", {
                user,
                ownerBranch: { branch: user.branch },
                branches: [user.branch],
                selectedBranchId: user.branch._id,
                products,
                units
              });
            })
            .catch(err => {
              console.error(err);
              res.redirect("/error-404");
            });
        }

      }).catch(err => {
        console.error(err);
        res.redirect("/error-404");
      });

    })
    .catch(err => {
      console.error(err);
      res.redirect("/error-404");
    });
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


router.get('/edit-product/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const user = await User.findById(req.user._id).populate('branch');
    const product = await Product.findById(req.params.id)
      .populate('category branch variants.supplier');

    if (!product) return res.redirect('/error-404');

    if (user.role !== 'owner' && !product.branch._id.equals(user.branch._id)) {
      return res.redirect('/unauthorized');
    }

    const categories = await Category.find();       // get categories for the dropdown
    const units = await Unit.find();                // get units for the variants dropdown

    res.render('Product/editProduct', { user, product, categories, units });
  } catch (err) {
    console.error(err);
    res.redirect('/error-404');
  }
});


router.post('/editProduct/:id', upload.single('product_image'), async (req, res, next) => {
  try {
    const productId = req.params.id;
    const {
      product,
      category,
      product_detail,
      mfgDate,
      expDate,
      quantity,
      unitCode,
      lowStockAlert,
      sellPrice
    } = req.body;

    const productDoc = await Product.findById(productId);
    if (!productDoc) return res.status(404).send('Product not found');

    let productModified = false;

    // Update product-level fields if changed
    if (product && product !== productDoc.product) {
      productDoc.product = product;
      productModified = true;
    }
    if (category && category != productDoc.category.toString()) {
      productDoc.category = category;
      productModified = true;
    }
    if (product_detail && product_detail !== productDoc.product_detail) {
      productDoc.product_detail = product_detail;
      productModified = true;
    }
    if (mfgDate && new Date(mfgDate).toISOString() !== productDoc.mfgDate.toISOString()) {
      productDoc.mfgDate = new Date(mfgDate);
      productModified = true;
    }
    if (expDate && new Date(expDate).toISOString() !== productDoc.expDate.toISOString()) {
      productDoc.expDate = new Date(expDate);
      productModified = true;
    }

    if (req.file) {
      productDoc.product_image = req.file.filename;
      productModified = true;
    }

    // Convert arrays
    const quantities = Array.isArray(quantity) ? quantity.map(Number) : [Number(quantity)];
    const unitCodes = Array.isArray(unitCode) ? unitCode : [unitCode];
    const lowStockAlerts = Array.isArray(lowStockAlert) ? lowStockAlert.map(Number) : [Number(lowStockAlert)];
    const sellPrices = Array.isArray(sellPrice) ? sellPrice.map(Number) : [Number(sellPrice)];

    const existingVariants = productDoc.variants;
    let baseQty = quantities[0]; // first variant is base
    let originalBaseQty = existingVariants[0].quantity;
    let baseQtyChange = baseQty - originalBaseQty;

    let ledgerVariants = [];

    // Loop and update variants
    for (let i = 0; i < existingVariants.length; i++) {
      let variant = existingVariants[i];
      let updated = false;

      if (variant.unitCode !== unitCodes[i]) {
        variant.unitCode = unitCodes[i];
        updated = true;
      }

      if (variant.lowStockAlert !== lowStockAlerts[i]) {
        variant.lowStockAlert = lowStockAlerts[i];
        updated = true;
      }

      if (variant.sellPrice !== sellPrices[i]) {
        variant.sellPrice = sellPrices[i];
        updated = true;
      }

      // Handle quantity / totalInBaseUnit changes
      if (i === 0) {
        // Base unit
        if (variant.quantity !== baseQty) {
          variant.quantity = baseQty;
          updated = true;
        }
      } else {
        let submittedTotalInBaseUnit = quantities[i]; // user edited value
        if (variant.totalInBaseUnit !== submittedTotalInBaseUnit) {
          variant.totalInBaseUnit = submittedTotalInBaseUnit;
          variant.quantity = baseQty * submittedTotalInBaseUnit;
          updated = true;
        } else if (baseQtyChange !== 0) {
          // baseQty changed, recalculate
          variant.quantity = baseQty * variant.totalInBaseUnit;
          updated = true;
        }
      }

      // Update totalWorth, totalPotentialRevenue
      variant.totalWorth = variant.quantity * productDoc.supplierPrice;
      variant.totalPotentialRevenue = variant.quantity * variant.sellPrice;

      if (updated) productModified = true;

      // Detect stock change: only stock_in or stock_out if quantity changed
      let qtyChange = variant.quantity - existingVariants[i].quantity;
      ledgerVariants.push({
        unitCode: variant.unitCode,
        stock_in: qtyChange > 0 ? qtyChange : 0,
        stock_out: qtyChange < 0 ? Math.abs(qtyChange) : 0,
        balance: variant.quantity
      });
    }

    if (productModified) {
      await productDoc.save();

      // Add StockLedger entry
      await StockLedger.create({
        date: new Date(),
        product: productDoc._id,
        variants: ledgerVariants,
        operator: req.user ? req.user._id : null,
        branch: productDoc.branch
      });
    }

    res.redirect('/manageProduct'); // or wherever you list products
  } catch (err) {
    console.error(err);
    next(err);
  }
});


router.get("/adjustStock", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;
  const currentSort = req.query.sort;

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const units = await Unit.find();

    let sortOption = { createdAt: -1 }; // default

    if (currentSort === "ascending") sortOption = { createdAt: 1 };
    else if (currentSort === "descending") sortOption = { createdAt: -1 };

    if (user.role === 'owner') {
      const allBranches = await Branch.find();
      const branchToUse = selectedBranchId || user.branch._id;

      // get actual branch document
      const branchDoc = allBranches.find(b => b._id.equals(branchToUse));

      // get products in selected branch
      const products = await Product.find({ branch: branchToUse })
        .populate('category')
        .populate('branch');

      let adjustmentsQuery = StockAdjustment.find().where('product').in(products.map(p => p._id));

      // Apply date filters
      if (currentSort === "today") {
        const today = new Date();
        today.setHours(0,0,0,0);
        adjustmentsQuery = adjustmentsQuery.where('createdAt').gte(today);
      } else if (currentSort === "lastMonth") {
        const now = new Date();
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        adjustmentsQuery = adjustmentsQuery.where('createdAt').gte(firstDayLastMonth).lte(lastDayLastMonth);
      } else if (currentSort === "last7days") {
        const last7days = new Date();
        last7days.setDate(last7days.getDate() - 7);
        adjustmentsQuery = adjustmentsQuery.where('createdAt').gte(last7days);
      }

      const adjustments = await adjustmentsQuery
        .populate('adjustedBy')
        .populate('product')
        .sort(sortOption)
        .limit(20);

      return res.render("Product/stock-adjustment", {
        user,
        ownerBranch: { branch: branchDoc },  // ✅ use actual selected branch doc
        branches: allBranches,
        selectedBranchId: branchToUse,
        products,
        units,
        adjustments,
        currentSort
      });
    } else {
      // staff: only own branch
      const products = await Product.find({ branch: user.branch._id })
        .populate('category')
        .populate('branch');

      let adjustmentsQuery = StockAdjustment.find().where('product').in(products.map(p => p._id));

      if (currentSort === "today") {
        const today = new Date();
        today.setHours(0,0,0,0);
        adjustmentsQuery = adjustmentsQuery.where('createdAt').gte(today);
      } else if (currentSort === "lastMonth") {
        const now = new Date();
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        adjustmentsQuery = adjustmentsQuery.where('createdAt').gte(firstDayLastMonth).lte(lastDayLastMonth);
      } else if (currentSort === "last7days") {
        const last7days = new Date();
        last7days.setDate(last7days.getDate() - 7);
        adjustmentsQuery = adjustmentsQuery.where('createdAt').gte(last7days);
      }

      const adjustments = await adjustmentsQuery
        .populate('adjustedBy')
        .populate('product')
        .sort(sortOption)
        .limit(20);

      return res.render("Product/stock-adjustment", {
        user,
        ownerBranch: { branch: user.branch },
        branches: [user.branch],
        selectedBranchId: user.branch._id,
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
});



router.post('/delete-stock-adjustment/:id', async (req, res, next) => {
  try {
    await StockAdjustment.findByIdAndDelete(req.params.id);
    res.redirect('/adjustStock'); // or wherever your page is
  } catch (err) {
    console.error('Error deleting adjustment:', err);
    next(err);
  }
});


router.get('/search-product', async (req, res) => {
  const q = req.query.q.toLowerCase();
  const products = await Product.find({ product: { $regex: q, $options: 'i' } }).select('product _id');
  res.json(products);
});

router.get('/get-product/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.json(product);
});


router.post('/adjust-stock', async (req, res, next) => {
  try {
    const { product, unitCode, adjustQty, adjustmentType, notes } = req.body;
    const branchId = req.user?.branch;
    const operator = req.user?._id;

    console.log('Adjust stock request:', { product, unitCode, adjustQty, adjustmentType, branchId });

    if (!product || !unitCode || !adjustQty || !adjustmentType || !branchId) {
      return res.status(400).send('Missing required fields.');
    }

    const adjustNum = parseFloat(adjustQty);
    if (isNaN(adjustNum) || adjustNum <= 0) {
      return res.status(400).send('Invalid adjustQty.');
    }

    const prod = await Product.findById(product);
    if (!prod) return res.status(404).send('Product not found');

    const variants = prod.variants || [];
    const selectedUnitCode = Array.isArray(unitCode) ? unitCode[0] : unitCode;

    const targetVariant = variants.find(v =>
      (v.unitCode || '').trim().toUpperCase() === (selectedUnitCode || '').trim().toUpperCase()
    );
    if (!targetVariant) return res.status(404).send(`Variant not found: ${selectedUnitCode}`);

    // adjust target variant qty
    let newTargetQty = targetVariant.quantity;
    if (adjustmentType === 'increase') {
      newTargetQty += adjustNum;
    } else if (adjustmentType === 'decrease') {
      newTargetQty -= adjustNum;
      if (newTargetQty < 0) newTargetQty = 0;
    } else {
      return res.status(400).send('Invalid adjustmentType');
    }
    targetVariant.quantity = newTargetQty;

    // recalculate other variants based on totalInBaseUnit
    let newBaseQty;
    if (!targetVariant.totalInBaseUnit || targetVariant.totalInBaseUnit === 0) {
      newBaseQty = newTargetQty;
    } else {
      newBaseQty = newTargetQty / targetVariant.totalInBaseUnit;
    }

    for (const v of variants) {
      if (!v.totalInBaseUnit || v.totalInBaseUnit === 0) {
        v.quantity = newBaseQty;
      } else {
        v.quantity = newBaseQty * v.totalInBaseUnit;
      }
    }

    await prod.save();

    // generate stock_ID like ADJ-BR-001
    const branch = await Branch.findById(branchId);
    if (!branch) return res.status(404).send('Branch not found');

    const prefix = branch.branch_name.toUpperCase().slice(0, 2);
    const stockPrefix = `ADJ-${prefix}-`;

    const latestLedger = await StockLedger.findOne({ stock_ID: { $regex: `^${stockPrefix}` } })
      .sort({ createdAt: -1 })
      .lean();

    const nextNumber = latestLedger?.stock_ID?.match(/\d+$/)
      ? parseInt(latestLedger.stock_ID.match(/\d+$/)[0]) + 1
      : 1;

    const generatedStockID = `${stockPrefix}${String(nextNumber).padStart(3, '0')}`;

    console.log('Creating StockLedger with stock_ID:', generatedStockID);

    // create StockLedger and save notes in `customer` field
    const ledgerDoc = await StockLedger.create({
      date: new Date(),
      product: prod._id,
      branch: branchId,
      operator,
      particular: 'Adjustment',
      stock_ID: generatedStockID,
      customer: notes || '',   // ✅ save notes in customer field
      variants: variants.map(v => ({
        unitCode: v.unitCode,
        stock_in: adjustmentType === 'increase' && v.unitCode === selectedUnitCode ? adjustNum : 0,
        stock_out: adjustmentType === 'decrease' && v.unitCode === selectedUnitCode ? adjustNum : 0,
        balance: v.quantity
      })),
      notes: notes || ''
    });

    console.log('StockLedger created successfully:', ledgerDoc._id);

    await StockAdjustment.create({
      product: prod._id,
      adjustedBy: operator,
      notes,
      variants: [
        {
          unitCode: selectedUnitCode,
          adjustmentType,
          quantity: adjustNum
        }
      ]
    });

    res.redirect('/adjustStock');
  } catch (err) {
    console.error('❌ Error adjusting stock:', err);
    next(err);
  }
});







router.get('/price-adjustments', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const selectedBranchId = req.query.branchId;

    // get logged in user & branch
    const user = await User.findById(req.user._id).populate('branch');
    if (!user) return res.redirect('/');

    // get units (if you need them on the page)
    const units = await Unit.find();

    if (user.role === 'owner') {
      // owner: see all branches & pick one
      const allBranches = await Branch.find();
      const branchToUse = selectedBranchId || user.branch._id;

      // 🟩 find actual selected branch doc
      const selectedBranchDoc = allBranches.find(b => b._id.equals(branchToUse));

      // get products of selected branch
      const products = await Product.find({ branch: branchToUse })
                                    .populate('category')
                                    .populate('branch');

      // get all price adjustments for these products
      const adjustments = await PriceAdjustment.find({ product: { $in: products.map(p => p._id) } })
                                  .populate('product')
                                  .populate('adjustedBy')
                                  .sort({ createdAt: -1 });

      res.render('Product/price-adjustment', {
        user,
        ownerBranch: { branch: selectedBranchDoc },     // ✅ use actual selected branch
        branches: allBranches,
        selectedBranchId: branchToUse,
        products,
        adjustments,
        units
      });

    } else {
      // staff: see only their branch
      const products = await Product.find({ branch: user.branch._id })
                                    .populate('category')
                                    .populate('branch');

      const adjustments = await PriceAdjustment.find({ product: { $in: products.map(p => p._id) } })
                                  .populate('product')
                                  .populate('adjustedBy')
                                  .sort({ createdAt: -1 });

      res.render('Product/price-adjustment', {
        user,
        ownerBranch: { branch: user.branch },
        branches: [user.branch],
        selectedBranchId: user.branch._id,
        products,
        adjustments,
        units
      });
    }

  } catch (err) {
    console.error('Error loading price adjustment page:', err);
    res.redirect('/error-404');
  }
});

router.post('/adjust-price', async (req, res, next) => {
  try {
    const { product, unitCode, adjustPrice, notes } = req.body;
    const operator = req.user ? req.user._id : null;

    if (!product || !unitCode || !adjustPrice || !operator) {
      return res.status(400).send('Missing required fields.');
    }

    const newPrice = parseFloat(adjustPrice);
    if (isNaN(newPrice) || newPrice <= 0) {
      return res.status(400).send('Invalid adjustPrice.');
    }

    const prod = await Product.findById(product);
    if (!prod) return res.status(404).send('Product not found');

    const variants = prod.variants || [];
    const variant = variants.find(v => v.unitCode === unitCode[0]);
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
          unitCode: unitCode[0],
          oldPrice,
          newPrice
        }
      ]
    });

    res.redirect('/price-adjustments');
  } catch (err) {
    console.error('Error adjusting price:', err);
    next(err);
  }
});

router.post('/delete-price-adjustment/:id', async (req, res, next) => {
  try {
    const adjustmentId = req.params.id;

    await PriceAdjustment.findByIdAndDelete(adjustmentId);

    res.redirect('/price-adjustments');
  } catch (err) {
    console.error('Error deleting price adjustment:', err);
    next(err);
  }
});


router.get("/stockTransfer", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;
  const currentSort = req.query.sort;

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const allBranches = await Branch.find();
    const branchToUse = selectedBranchId || user.branch._id;

    // get actual branch doc to show correct name
    const branchDoc = allBranches.find(b => b._id.equals(branchToUse));

    // get products for selected branch
    const products = await Product.find({ branch: branchToUse })
      .populate('variants.supplier')
      .populate('branch');

    // sort option
    let sortOption = { date: -1 }; // default
    if (currentSort === "ascending") sortOption = { date: 1 };
    else if (currentSort === "descending") sortOption = { date: -1 };

    // date filter
    let dateFilter = {};
    if (currentSort === "today") {
      const today = new Date(); today.setHours(0,0,0,0);
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

    // find transfers where selected branch is involved
    const transfers = await TransferStock.find({
      $and: [
        { $or: [
          { branch_from: branchToUse },
          { branch_to: branchToUse }
        ] },
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
      branches: allBranches,
      selectedBranchId: branchToUse,
      products,
      transfers,
      currentSort
    });
  } catch (err) {
    console.error("Error loading stockTransfer page:", err);
    res.status(500).send("Server error.");
  }
});



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
      particulars: `Edited transfer #${oldTransfer.invoice_number}`,
      targetModel: 'TransferStock',
      targetId: oldTransfer._id,
      before: { quantity: oldQty },
      after: { quantity: newQty }
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
      particulars: `Deleted transfer #${invoice_number}`,
      targetModel: 'TransferStock',
      targetId: transferId,
      before: { quantity: oldQty },
      after: null
    });

    res.redirect('/stockTransfer');
  } catch (err) {
    console.error('Delete transfer error:', err);
    next(err);
  }
});





// STOCK ROUTE ENDS HERE 

// RECEIVE STOCK ROUTE 
router.get("/purchase-stock", (req, res) => {
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

            Promise.all([
              ReceivedStock.find({ branch: branchToFilter })
                .populate('supplier branch'),
              Supplier.find().populate('supplierInvoice'),
              Branch.findById(user.branch)
            ])
              .then(([stock, suppliers, ownerBranch]) => {
                res.render("PurchaseStock/purchase-stock", {
                  user,
                  ownerBranch: { branch: ownerBranch },
                  branches: allBranches,
                  selectedBranchId: branchToFilter,
                  stock,
                  suppliers
                });
              })
              .catch(err => {
                console.error("Error fetching stock/suppliers:", err);
                res.redirect("/error-404");
              });
          });
      } else {
        Promise.all([
          ReceivedStock.find({ branch: user.branch._id })
            .populate('supplier branch'),
          Supplier.find().populate('supplierInvoice')
        ])
          .then(([stock, suppliers]) => {
            res.render("PurchaseStock/purchase-stock", {
              user,
              ownerBranch: { branch: user.branch },
              branches: [user.branch],
              selectedBranchId: user.branch._id,
              stock,
              suppliers
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

    // Log the edit in ActionLog
    await ActionLog.create({
      action: "edit",
      operator,
      branch,
      particulars: `Edited purchase invoice ${invoice_number}`,
      targetModel: "ReceivedStock",
      targetId: originalStock._id,
      before: originalStock,
      after: updatedStock,
      date: new Date()
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

    // Find the original ReceivedStock
    const originalStock = await ReceivedStock.findOne({ invoice_number }).populate('supplier');
    if (!originalStock) return res.status(404).send('Purchase not found.');

    const branch = req.user?.branch;
    const operator = req.user?._id;

    if (!branch) return res.status(400).send('Missing branch.');

    // Loop through items to reverse the stock
    for (const item of originalStock.items) {
      const product = await Product.findById(item.product);
      if (!product || !product.variants || product.variants.length === 0) continue;

      const baseIndex = product.variants.findIndex(v => v.unitCode === item.unitCode);
      if (baseIndex === -1) continue;

      // Decrease the product stock
      product.variants[baseIndex].quantity -= item.item_qty;
      const baseQty = product.variants[baseIndex].quantity;

      // Recalculate other variants
      for (let j = 0; j < product.variants.length; j++) {
        if (j !== baseIndex) {
          product.variants[j].quantity = baseQty * product.variants[j].totalInBaseUnit;
        }
      }

      await product.save();

      // Add StockLedger entry marking stock_out
      await StockLedger.create({
        date: new Date(),
        product: product._id,
        customer: originalStock.supplier?.supplier || '',  // supplier name
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

    // === CREATE ACTION LOG ===
    await ActionLog.create({
      action: 'delete',
      operator,
      branch,
      particulars: `Deleted purchase invoice ${invoice_number}`,
      targetModel: 'ReceivedStock',
      targetId: originalStock._id,
      before: originalStock,    // store the full doc before deletion
      after: null
    });

    // Finally delete the ReceivedStock
    await ReceivedStock.deleteOne({ invoice_number });

    return res.redirect('/purchase-stock');

  } catch (err) {
    console.error('Delete ReceiveStock Error:', err);
    next(err);
  }
});




// UNIT CODE 
router.get("/addUnit", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const allUnits = await Unit.find().sort({ createdAt: -1 }); // optional: latest first

    if (user.role === 'owner') {
      const allBranches = await Branch.find();
      const branchToUse = selectedBranchId || user.branch._id;

      // 🟩 Find actual selected branch document
      const selectedBranchDoc = allBranches.find(b => b._id.equals(branchToUse));

      return res.render("Unit/unit", {
        user,
        ownerBranch: { branch: selectedBranchDoc },  // ✅ use actual selected branch
        branches: allBranches,
        selectedBranchId: branchToUse,               // ✅ keep dropdown active
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
});



router.post("/addUnit", async (req, res) => {
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
});

router.post("/updateUnit/:id", async (req, res, next) => {
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
});


router.post("/deleteUnit/:id", async (req, res, next) => {
  try {
    await Unit.findByIdAndDelete(req.params.id);
    res.redirect("/addUnit");
  } catch (err) {
    console.error("Error deleting unit:", err);
    next(err);
  }
});
// UNIT CODE ENDS HERE

// CATEGORIES STARTS 
router.get("/addCategory", (req, res) => {
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
              ownerBranch: { branch: ownerBranch },           // ✅ pass actual selected branch
              branches: branchList,
              selectedBranchId: selectedBranchIdToUse,        // ✅ so dropdown stays active
              categories
            });
          })
          .catch(err => {
            console.error("Error fetching categories:", err);
            res.redirect("/error-404");
          });
      };

      if (user.role === 'owner') {
        Branch.find()
          .then(allBranches => {
            const branchToUse = selectedBranchId || user.branch._id;

            // 🟩 Find actual selected branch doc
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
});


router.post("/addCategories", (req, res) => {
    const { category_name } = req.body;

    const newCategory = new Category({
      category_name
    });
  
    newCategory.save()
      .then(savedCategory => {
        res.redirect("/addCategory")
      })
      .catch(err => {
        console.error("Error adding supplier:", err);
        res.status(500).json({ message: "Failed to add supplier", error: err.message });
      });
});

router.post("/update/category/:id", async (req, res, next) => {
  try {
    const { category_name } = req.body;
    const categoryId = req.params.id;

    await Category.findByIdAndUpdate(categoryId, { category_name });
    res.redirect("/addCategory");
  } catch (error) {
    console.error("Update category error:", error);
    next(error);
  }
});

router.post("/delete/category/:id", async (req, res, next) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.redirect("/addCategory");
  } catch (error) {
    console.error("Delete category error:", error);
    next(error);
  }
});

router.post("/addCategories-product", (req, res) => {
    const { category_name } = req.body;

    const newCategory = new Category({
      category_name
    });
  
    newCategory.save()
      .then(savedCategory => {
        res.redirect("/addProduct")
      })
      .catch(err => {
        console.error("Error adding supplier:", err);
        res.status(500).json({ message: "Failed to add supplier", error: err.message });
      });
});
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

router.post("/addBranch", (req, res, next) => {
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
});

router.post("/updateBranch", (req, res) => {
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
});

router.get("/deleteBranch/:id", (req, res) => {
  const branchId = req.params.id;

  Branch.findByIdAndDelete(branchId)
    .then(() => {
      res.redirect("/manageBranch"); // or wherever your table is shown
    })
    .catch(err => {
      console.error("Delete failed:", err);
      res.redirect("/error-404");
    });
});

// BRANCH ENDS HERE ----------------- TECH MAYOR GROUPS


// STORE ROUTE STARTS HERE
router.get("/manageParkingStore", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      if (user.role === 'owner') {
        Branch.findById(user.branch)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => {
                ParkingStore.find({ branch: user.branch })
                  .populate('branch', 'branch_name') // Populate branch name
                  .then(parkingStores => {
                    res.render("Store/Store", {
                      user,
                      ownerBranch: { branch: ownerBranch },
                      branches: allBranches,
                      parkingStores
                    });
                  })
                  .catch(err => {
                    console.error("Error fetching parking stores:", err);
                    res.redirect("/error-404");
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
        ParkingStore.find({ branch: user.branch })
          .then(parkingStores => {
            res.render("Store/Store", {
              user,
              ownerBranch: { branch: user.branch },
              parkingStores
            });
          })
          .catch(err => {
            console.error("Error fetching parking stores:", err);
            res.redirect("/error-404");
          });
      }
    })
    .catch(err => {
      console.error(err);
      res.redirect("/error-404");
    });
});

router.get("/stockAction", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      if (user.role === 'owner') {
        Branch.findById(user.branch)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => {
                ParkingStore.find({ branch: user.branch })
                  .populate('branch', 'branch_name') // Populate branch name
                  .then(parkingStores => {
                    res.render("Store/storeAction", {
                      user,
                      ownerBranch: { branch: ownerBranch },
                      branches: allBranches,
                      parkingStores
                    });
                  })
                  .catch(err => {
                    console.error("Error fetching parking stores:", err);
                    res.redirect("/error-404");
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
        ParkingStore.find({ branch: user.branch })
          .then(parkingStores => {
            res.render("Store/storeAction", {
              user,
              ownerBranch: { branch: user.branch },
              parkingStores
            });
          })
          .catch(err => {
            console.error("Error fetching parking stores:", err);
            res.redirect("/error-404");
          });
      }
    })
    .catch(err => {
      console.error(err);
      res.redirect("/error-404");
    });
});

router.post("/create-parking-store", (req, res) => {
  const { storeName } = req.body;
  const branch = req.user?.branch;
  const userId = req.user?._id;

  if (!storeName || !branch) {
    return res.status(400).json({ error: "Store name and branch are required" });
  }

  // Check for existing store name in this branch
  ParkingStore.findOne({ storeName, branch })
    .then(existing => {
      if (existing) {
        return res.status(409).json({ error: "Parking store name already exists for this branch" });
      }

      return ParkingStore.create({
        storeName,
        branch,
        createdBy: userId
      });
    })
    .then(newStore => {
      res.redirect("/manageParkingStore")
    })
    .catch(err => {
      console.error("Error creating parking store:", err);
      res.status(500).json({ error: "Internal server error" });
    });
});


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


router.post("/updateStore", (req, res) => {
  const updateData = {
    storeName: req.body.storeName
  };

  ParkingStore.findByIdAndUpdate(req.body.store_id, { $set: updateData }, { new: true })
    .then(updatedDocument => {
      res.redirect("/manageParkingStore");
    })
    .catch(err => {
      console.error("Error updating document:", err);
    });
});

router.get("/deleteStore/:id", (req, res) => {
  const storeId = req.params.id;

  ParkingStore.findByIdAndDelete(storeId)
    .then(() => {
      res.redirect("/manageParkingStore");
    })
    .catch(err => {
      res.redirect("/error-404");
    });
});

// STORE ENDS HERE ----------------- TECH MAYOR GROUPS

// SALES ROUTE STARTS HERE 
router.get("/createSales", (req, res, next) => {
  if (req.isAuthenticated()) {
    User.findById(req.user._id)
      .populate("branch")
      .then(user => {
        if (!user) return res.redirect("/");

        const branchId = user.branch._id || user.branch;

        const fetchCustomersAndProducts = (ownerBranch, allBranches) => {
          Promise.all([
            Customer.find({ branch: branchId }).sort({ createdAt: -1 }),
            Product.find({ branch: branchId }).sort({ createdAt: -1 }),
            Category.find({}),
            Config.findOne({ key: "negativeSalesActive" })
          ])
            .then(([customers, products, categories, config]) => {
              const negativeSalesActive = config?.value === true;

              res.render("Sales/createSales", {
                user: user,
                ownerBranch: { branch: ownerBranch },
                branches: allBranches || [],
                customers: customers,
                products: products,
                categories: categories,
                negativeSalesActive: negativeSalesActive
              });
            })
            .catch(err => {
              console.error("Error fetching invoice data:", err);
              next(err);
            });
        };

        if (user.role === 'owner') {
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
  } else {
    res.redirect("/");
  }
});

router.post("/settings/toggle-negative-sales", async (req, res) => {
  if (!req.isAuthenticated() || req.user.role !== 'owner') {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  try {
    let config = await Config.findOne({ key: "negativeSalesActive" });
    if (!config) {
      config = new Config({ key: "negativeSalesActive", value: true });
    } else {
      config.value = !config.value;
    }

    await config.save();

    res.json({ success: true, active: config.value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

router.get('/searchCustomer', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const regex = new RegExp(`^${q}`, 'i');

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

// router.post('/addinvoice', async (req, res, next) => {
//   console.log("Received request to add invoice:", req.body);
  
// });

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

router.post("/addinvoice", async (req, res, next) => {
  const roundToTwo = num => Math.round((num + Number.EPSILON) * 100) / 100;

  try {
    const branchId = req.user?.branch;
    if (!branchId) throw { status: 400, message: "Branch not found on user" };

    let {
      customer_id,
      customer_name,
      payment_date,
      sales_type,
      payment_type,
      paymentRef,
      discount = 0,
      product,
      qty,
      unitcode,
      rate,
      total,
      grand_total,
      paid_amount
    } = req.body;

    [product, qty, unitcode, rate, total] = [product, qty, unitcode, rate, total].map(arr =>
      Array.isArray(arr) ? arr : [arr]
    );

    const filtered = product.map((p, i) => ({
      product: p?.trim(),
      qty: qty[i],
      unitcode: unitcode[i],
      rate: rate[i],
      total: total[i]
    })).filter(item => item.product);

    if (!filtered.length) throw { status: 400, message: "No valid product lines" };

    const grandTotalNum = roundToTwo(+grand_total);
    const paidAmountNum = roundToTwo(+paid_amount);
    const remainingAmount = roundToTwo(grandTotalNum - paidAmountNum);

    let customer = customer_id
      ? await Customer.findById(customer_id)
      : await Customer.create({ customer_name, branch: branchId });
    if (!customer) throw { status: 400, message: "Unable to find or create customer" };

    if (sales_type === 'credit') {
      const newDebt = (customer.remaining_amount || 0) + remainingAmount;
      if (customer.credit_limit && newDebt > customer.credit_limit) {
        throw {
          status: 400,
          message: `Credit limit exceeded! Available: ₦${(customer.credit_limit - (customer.remaining_amount || 0)).toLocaleString()}`
        };
      }
    }

    const config = await Config.findOne({ key: "negativeSalesActive" });
    const negativeSalesAllowed = config?.value === true;

    const branch = await Branch.findById(branchId);
    const prefix = branch.branch_name.slice(0, 2).toUpperCase();
    const [invoice_no, receipt_no] = await Promise.all([
      generateNextNumber("invoice_no", `INV-${prefix}-`),
      generateNextNumber("receipt_no", sales_type === 'cash' ? `CH-${prefix}-` : `CR-${prefix}-`)
    ]);

    const items = [];

    for (const { product: productName, qty: qtyStr, unitcode, rate: rateStr, total: totalStr } of filtered) {
      const soldQty = roundToTwo(+qtyStr);
      const itemRate = roundToTwo(+rateStr);
      const itemTotal = roundToTwo(+totalStr);

      const productDoc = await Product.findOne({ product: productName, branch: branchId });
      if (!productDoc) continue;

      const baseVariant = productDoc.variants[0];
      const sellingVariant = productDoc.variants.find(v => v.unitCode === unitcode);
      if (!sellingVariant) continue;

      if (!negativeSalesAllowed && sellingVariant.quantity < soldQty) {
        throw { status: 400, message: `Insufficient stock for ${productName} (${unitcode})` };
      }

      sellingVariant.quantity -= soldQty;

      if (sellingVariant.unitCode !== baseVariant.unitCode && sellingVariant.totalInBaseUnit) {
        baseVariant.quantity = sellingVariant.quantity / sellingVariant.totalInBaseUnit;
      }

      productDoc.variants.forEach(v => {
        if (v.unitCode !== baseVariant.unitCode && v.totalInBaseUnit) {
          v.quantity = baseVariant.quantity * v.totalInBaseUnit;
        }
      });

      productDoc.variants.forEach(v => v.quantity = roundToTwo(v.quantity));
      await productDoc.save();

      items.push({
        product: productDoc._id,
        product_name: productName,
        qty: soldQty,
        unitcode,
        rate: itemRate,
        total: itemTotal
      });

      await StockLedger.create({
        date: new Date(payment_date),
        product: productDoc._id,
        branch: branchId,
        operator: req.user._id,
        customer: customer.customer_name,
        stock_ID: invoice_no,
        particular: 'Sales',
        variants: productDoc.variants.map(v => ({
          unitCode: v.unitCode,
          stock_in: 0,
          stock_out: v.unitCode === unitcode ? soldQty : 0,
          balance: v.quantity,
          cost_price: v.cost_price || 0,
          total_sales: v.unitCode === unitcode ? itemTotal : 0
        }))
      });

      await SalesLedger.create({
        product: productDoc._id,
        product_name: productName,
        sale_date: new Date(payment_date),
        unit: unitcode,
        unit_price: itemRate,
        quantity_sold: soldQty,
        amount: itemTotal,
        customer: customer._id,
        customer_name: customer.customer_name,
        receipt_no,
        instock_qty: sellingVariant.quantity,
        branch: branchId,
        operator: req.user._id,
        sales_type
      });
    }

    const invoiceDoc = await Invoice.create({
      customer_id: customer._id,
      customer_name: customer.customer_name,
      payment_date,
      sales_type,
      payment_type,
      paymentRef,
      discount: +discount || 0,
      items,
      grand_total: grandTotalNum,
      paid_amount: paidAmountNum,
      remaining_amount: remainingAmount,
      invoice_no,
      receipt_no,
      branch: branchId,
      user: req.user._id,
      createdBy: req.user._id
    });

    // 🧾 Get last balance from ledger
const previousLedger = await CustomerLedger.find({ customer: customer._id }).sort({ date: -1 });
const lastLedgerBalance = previousLedger.length > 0 ? previousLedger[0].Balance : 0;

let newLedgerBalance = lastLedgerBalance;

if (sales_type === 'credit') {
  newLedgerBalance = roundToTwo(lastLedgerBalance - grandTotalNum);

  await CustomerLedger.create({
    customer: customer._id,
    branch: branchId,
    type: 'credit-sales',
    refNo: receipt_no,
    date: payment_date,
    amount: grandTotalNum,
    paid: 0,
    Balance: newLedgerBalance
  });

  customer.remaining_amount = newLedgerBalance;
  customer.total_debt = newLedgerBalance;

} else {
  await CustomerLedger.create({
    customer: customer._id,
    branch: branchId,
    type: 'paid-sales',
    refNo: receipt_no,
    date: payment_date,
    amount: grandTotalNum,
    paid: 0,
    Balance: lastLedgerBalance
  });
}


    customer.sales_amount = roundToTwo((customer.sales_amount || 0) + grandTotalNum);
    customer.order_count = (customer.order_count || 0) + 1;
    if (sales_type === 'cash') {
      customer.cash_sales_count = (customer.cash_sales_count || 0) + 1;
    } else if (sales_type === 'credit') {
      customer.credit_sales_count = (customer.credit_sales_count || 0) + 1;
    }

    await customer.save();

    res.redirect(`/receipt/${invoiceDoc._id}`);
  } catch (err) {
    console.error("Error adding invoice:", err);
    next(err);
  }

  async function generateNextNumber(field, prefix) {
    const last = await Invoice.findOne({ [field]: { $regex: `^${prefix}` } }).sort({ createdAt: -1 });
    const nextNum = last?.[field]?.match(/\d+$/)
      ? parseInt(last[field].match(/\d+$/)[0]) + 1 : 1;
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }
});




router.post('/update-invoices', async (req, res) => {
  try {
    const {
      invoice_id,
      items,
      customer_id,
      customer_name,
      payment_date,
      sales_type,
      paid_amount,
      receipt_no,
      paymentRef
    } = req.body;

    console.log("Received request to update invoice:", req.body);

    const paid = Math.abs(parseFloat(paid_amount)) || 0;
    const ledgerDate = new Date(payment_date);

    const invoice = await Invoice.findById(invoice_id);
    if (!invoice) return res.status(404).send('Invoice not found');

    const ledger = await CustomerLedger.findOne({ refNo: receipt_no, customer: customer_id });
    if (!ledger) return res.status(404).send('Ledger not found');

    const branch = ledger.branch;

    // === Ledger update ===
    ledger.date = ledgerDate;
    ledger.status = 'edited';
    ledger.type = sales_type === 'credit' ? 'credit-sales' : 'paid-sales';
    ledger.amount = paid; // always store positive number
    ledger.paid = 0;

    await ledger.save();

    // === Recalculate Balance ===
    const allEntries = await CustomerLedger.find({ customer: customer_id, branch }).sort({ date: 1, createdAt: 1 });

    let runningBalance = 0;
    for (const entry of allEntries) {
      if (entry.type === 'credit-sales') {
        runningBalance -= entry.amount; // credit: subtract from balance
      } else if (entry.type === 'paid-sales' || entry.type === 'payment') {
        runningBalance += entry.amount; // cash: add to balance
      }
      entry.Balance = runningBalance;
      await entry.save();
    }

    // === Update invoice items ===
    invoice.items = invoice.items.map((item) => {
      const itemUpdate = items[item.product.toString()];
      if (itemUpdate) {
        const qty = parseInt(itemUpdate.qty);
        item.qty = qty;
        item.total = qty * item.rate;
      }
      return item;
    });

    const grandTotal = invoice.items.reduce((sum, item) => sum + item.total, 0);
    const remaining = grandTotal - paid;

    // === Update invoice ===
    invoice.customer_id = customer_id;
    invoice.customer_name = customer_name;
    invoice.payment_date = ledgerDate;
    invoice.sales_type = sales_type;
    invoice.payment_type = sales_type;
    invoice.paid_amount = paid;
    invoice.remaining_amount = remaining;
    invoice.receipt_no = receipt_no;
    invoice.paymentRef = paymentRef;
    invoice.grand_total = grandTotal;
    invoice.status = 'edited';
    invoice.updatedAt = new Date();

    await invoice.save();

    res.status(200).send('Invoice and ledger updated successfully');
  } catch (err) {
    console.error('Invoice update error:', err);
    res.status(500).send('Internal server error');
  }
});



router.post("/update-invoice", async (req, res) => {
  try {
    const {
      invoice_id,
      items,
      customer_id,
      customer_name,
      payment_date,
      sales_type,
      paid_amount,
      receipt_no,
      paymentRef
    } = req.body;

    console.log("Received request to update invoice:", req.body);

    const paid = Number(paid_amount);
    const newDate = new Date(payment_date);

    // 1️⃣ Flatten the items object into an array for invoice update
    const formattedItems = Object.entries(items).map(([productId, details]) => ({
      product: productId,
      qty: Number(details.qty)
    }));

    // 2️⃣ Calculate grand total (you might need rate data from DB if not included)
    // For now we assume rate and total remain the same.
    const grand_total = paid; // simplified assumption

    // 3️⃣ Update the invoice record
    const invoice = await CustomerInvoice.findByIdAndUpdate(invoice_id, {
      customer_id,
      customer_name,
      items: formattedItems,
      payment_date: newDate,
      sales_type,
      paid_amount: paid,
      remaining_amount: grand_total - paid,
      payment_type: sales_type === 'cash' ? 'cash' : 'credit',
      grand_total,
      receipt_no,
      paymentRef
    }, { new: true });

    if (!invoice) return res.status(404).send('Invoice not found');

    // 4️⃣ Find the matching CustomerLedger entry using receipt_no
    const ledgerEntry = await CustomerLedger.findOne({ refNo: receipt_no, customer: customer_id });
    if (!ledgerEntry) return res.status(404).send('Ledger entry not found');

    // 5️⃣ Update ledger entry fields
    const ledgerType = sales_type === 'cash' ? 'paid-sales' : 'credit-sales';
    ledgerEntry.type = ledgerType;
    ledgerEntry.date = newDate;
    ledgerEntry.amount = sales_type === 'credit' ? grand_total : 0;
    ledgerEntry.paid = sales_type === 'cash' ? grand_total : 0;

    await ledgerEntry.save();

    // 6️⃣ Recalculate balances for that customer in that branch
    const branch = invoice.branch;
    const allEntries = await CustomerLedger.find({ customer: customer_id, branch }).sort({ date: 1, createdAt: 1 });

    let runningBalance = 0;
    for (const entry of allEntries) {
      if (entry.type === 'credit-sales') {
        runningBalance += entry.amount;
      } else if (entry.type === 'paid-sales' || entry.type === 'payment') {
        runningBalance -= entry.paid;
      }
      entry.Balance = runningBalance;
      await entry.save();
    }

    res.redirect('/CustomerInvoice');

  } catch (err) {
    console.error('Update invoice failed:', err);
    res.status(500).send('Update invoice failed');
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

router.get("/manage-sales", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      const branchId = user.branch._id || user.branch;

      if (user.role === 'owner') {
        // If user is owner, fetch owner branch and all branches
        Branch.findById(branchId)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => {
                Invoice.find({ branch: branchId })
                  .populate("customer_id")
                  .populate("createdBy")
                  .sort({ createdAt: -1 })
                  .then(invoices => {
                    res.render("Sales/manage-sales", {
                      user,
                      ownerBranch: { branch: ownerBranch },
                      branches: allBranches,
                      invoices
                    });
                  })
                  .catch(err => {
                    console.error("Error fetching invoices:", err);
                    res.redirect("/error-404");
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
        // If not owner, just fetch invoices for user's branch
        Invoice.find({ branch: branchId })
          .populate("customer_id")
          .populate("createdBy")
          .sort({ createdAt: -1 })
          .then(invoices => {
            res.render("Sales/manage-sales", {
              user,
              ownerBranch: { branch: user.branch },
              invoices
            });
          })
          .catch(err => {
            console.error("Error fetching invoices:", err);
            res.redirect("/error-404");
          });
      }
    })
    .catch(err => {
      console.error("Error fetching user:", err);
      res.redirect("/error-404");
    });
});









// SALES ROUTE ENDS HERE ................ TECH MYOR 


// EXPIRED PRODUCTS ROUTE STARTS HERE
router.get("/expiredProducts", async (req, res) => {
  const currentDate = new Date();
  const selectedBranchId = req.query.branchId;

  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    // OWNER ROUTE
    if (user.role === "owner") {
      const allBranches = await Branch.find();
      const branchToFilter = selectedBranchId || user.branch._id;

      // 🟩 Find actual selected branch document
      const branchDoc = allBranches.find(b => b._id.equals(branchToFilter));

      const expiredProducts = await Product.find({
        branch: branchToFilter,
        expDate: { $lt: currentDate }
      }).populate("branch category variants.supplier");

      if (expiredProducts.length > 0) {
        const existingNotification = await Notification.findOne({
          type: "expiredStock",
          pageLink: `/expiredProducts?branchId=${branchDoc._id}`,
          isDismissed: false
        });

        if (!existingNotification) {
          await Notification.create({
            title: "Expired Stock Alert",
            description: `There are ${expiredProducts.length} expired product(s) at branch ${branchDoc.branch_name}.`,
            type: "expiredStock",
            pageLink: `/expiredProducts?branchId=${branchDoc._id}`
          });
        }
      }

      return res.render("ExpiredProducts/expiredProducts", {
        user,
        ownerBranch: { branch: branchDoc },     // ✅ pass actual selected branch doc
        branches: allBranches,
        selectedBranchId: branchToFilter,
        expiredProducts
      });
    }

    // STAFF ROUTE
    const expiredProducts = await Product.find({
      branch: user.branch._id,
      expDate: { $lt: currentDate }
    }).populate("branch category variants.supplier");

    if (expiredProducts.length > 0) {
      const existingNotification = await Notification.findOne({
        type: "expiredStock",
        pageLink: `/expiredProducts?branchId=${user.branch._id}`,
        isDismissed: false
      });

      if (!existingNotification) {
        await Notification.create({
          title: "Expired Stock Alert",
          description: `You have ${expiredProducts.length} expired product(s) at branch ${user.branch.branch_name}.`,
          type: "expiredStock",
          pageLink: `/expiredProducts?branchId=${user.branch._id}`
        });
      }
    }

    return res.render("ExpiredProducts/expiredProducts", {
      user,
      ownerBranch: { branch: user.branch },
      branches: [user.branch],
      selectedBranchId: user.branch._id,
      expiredProducts
    });
  } catch (err) {
    console.error(err);
    res.redirect("/error-404");
  }
});

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

router.get("/lowStock", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    if (user.role === "owner") {
      const allBranches = await Branch.find();
      const branchToFilter = selectedBranchId || user.branch._id;

      // 🟩 Find actual selected branch doc
      const branchDoc = allBranches.find(b => b._id.equals(branchToFilter));

      // LOW STOCK: products with any variant quantity <= lowStockAlert
      let lowStockProducts = await Product.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(branchToFilter) } },
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

      // OUT OF STOCK: products where all variants have quantity <= 0
      let outOfStockProducts = await Product.aggregate([
        { $match: { branch: new mongoose.Types.ObjectId(branchToFilter) } },
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

      // Populate
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

      // Notification for low stock
      if (lowStockProducts.length > 0) {
        const existingLowStockNotification = await Notification.findOne({
          type: "lowStock",
          pageLink: `/lowStock?branchId=${branchDoc._id}`,
          isDismissed: false
        });
        if (!existingLowStockNotification) {
          await Notification.create({
            title: "Low Stock Alert",
            description: `There are ${lowStockProducts.length} low stock product(s) at branch ${branchDoc.branch_name}.`,
            type: "lowStock",
            pageLink: `/lowStock?branchId=${branchDoc._id}`,
            branch: branchDoc._id
          });
        }
      }

      // Notification for out of stock
      if (outOfStockProducts.length > 0) {
        const existingOutOfStockNotification = await Notification.findOne({
          type: "outOfStock",
          pageLink: `/lowStock?branchId=${branchDoc._id}`,
          isDismissed: false
        });
        if (!existingOutOfStockNotification) {
          await Notification.create({
            title: "Out of Stock Alert",
            description: `There are ${outOfStockProducts.length} completely out of stock product(s) at branch ${branchDoc.branch_name}.`,
            type: "outOfStock",
            pageLink: `/lowStock?branchId=${branchDoc._id}`,
            branch: branchDoc._id
          });
        }
      }

      return res.render("LowStock/low-stock", {
        user,
        ownerBranch: { branch: branchDoc },  // ✅ pass actual selected branch
        branches: allBranches,
        selectedBranchId: branchToFilter,
        lowStockProducts,
        outOfStockProducts
      });
    }

    // STAFF ROUTE
    let lowStockProducts = await Product.aggregate([
      { $match: { branch: new mongoose.Types.ObjectId(user.branch._id) } },
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
      { $match: { branch: new mongoose.Types.ObjectId(user.branch._id) } },
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

    // Populate
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

    // Notifications for staff (always add branch)
    if (lowStockProducts.length > 0) {
      const existingLowStockNotification = await Notification.findOne({
        type: "lowStock",
        pageLink: `/lowStock?branchId=${user.branch._id}`,
        isDismissed: false
      });
      if (!existingLowStockNotification) {
        await Notification.create({
          title: "Low Stock Alert",
          description: `You have ${lowStockProducts.length} low stock product(s) at branch ${user.branch.branch_name}.`,
          type: "lowStock",
          pageLink: `/lowStock?branchId=${user.branch._id}`,
          branch: user.branch._id
        });
      }
    }

    if (outOfStockProducts.length > 0) {
      const existingOutOfStockNotification = await Notification.findOne({
        type: "outOfStock",
        pageLink: `/lowStock?branchId=${user.branch._id}`,
        isDismissed: false
      });
      if (!existingOutOfStockNotification) {
        await Notification.create({
          title: "Out of Stock Alert",
          description: `You have ${outOfStockProducts.length} completely out of stock product(s) at branch ${user.branch.branch_name}.`,
          type: "outOfStock",
          pageLink: `/lowStock?branchId=${user.branch._id}`,
          branch: user.branch._id
        });
      }
    }

    return res.render("LowStock/low-stock", {
      user,
      ownerBranch: { branch: user.branch },
      branches: [user.branch],
      selectedBranchId: user.branch._id,
      lowStockProducts,
      outOfStockProducts
    });
  } catch (err) {
    console.error(err);
    res.redirect("/error-404");
  }
});


// LOW STOCK ROUTE ENDS HERE ----------------- TECH MAYOR GROUPS

// EXPENSE ROUTE STARTS HERE

router.get("/expense", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      Promise.all([
        Expense.find({ branch: user.branch._id })
          .populate("branch")
          .populate("category"),
        ExpenseCategory.find()
      ])
        .then(([expenses, expenseCategories]) => {
          res.render("Expense/expense", {
            user,
            ownerBranch: { branch: user.branch },
            expenses,
            expenseCategories
          });
        })
        .catch(err => {
          console.error("Error fetching expenses or categories:", err);
          res.redirect("/error-404");
        });
    })
    .catch(err => {
      console.error("Error fetching user:", err);
      res.redirect("/error-404");
    });
});

router.get("/expense-category", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      ExpenseCategory.find({})
        .then(expenseCategories => {
          res.render("Expense/expense-category", {
            user,
            ownerBranch: { branch: user.branch },
            expenseCategories
          });
        })
        .catch(err => {
          console.error("Error fetching expenses:", err);
          res.redirect("/error-404");
        });
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


router.post("/addExpense", (req, res) => {
  const { title, description, category, date, amount } = req.body;

  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  User.findById(req.user._id)
    .then(user => {
      if (!user) return res.redirect('/');

      const newExpense = new Expense({
        title,
        description,
        category,
        date,
        amount,
        branch: user.branch,
        created_by: user._id // ✅ Important: Track who created the expense
      });

      return newExpense.save();
    })
    .then(() => {
      res.redirect('/expense');
    })
    .catch(err => {
      console.error("Error adding expense:", err); // corrected log
      res.status(500).send("Internal Server Error");
    });
});


// Update Expense
router.post('/updateExpense', (req, res) => {
  const { expenseId, title, description, category, date, amount } = req.body;

  Expense.findByIdAndUpdate(expenseId, {
    title, description, category, date, amount
  })
    .then(() => res.redirect('/expense'))
    .catch(err => {
      console.error('Update failed:', err);
      res.status(500).send("Failed to update expense.");
    });
});

// Delete Expense
router.post('/deleteExpense', (req, res) => {
  Expense.findByIdAndDelete(req.body.expenseId)
    .then(() => res.redirect('/expense'))
    .catch(err => {
      console.error('Delete failed:', err);
      res.status(500).send("Failed to delete expense.");
    });
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
router.get("/transactions", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const branchId = user.branch._id || user.branch;

    const [ownerBranch, allBranches] = user.role === 'owner'
      ? await Promise.all([
          Branch.findById(branchId),
          Branch.find()
        ])
      : [user.branch, null];

    const [customers, loans, transactionsRaw] = await Promise.all([
      Customer.find({ branch: branchId }),
      Loan.find({ branch: branchId }),
      Transaction.find({ branch: branchId })
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
    const transactions = transactionsRaw.map(tx => {
      const userName = tx.transactionType === "Customer"
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
      branches: allBranches,
      customers,
      loans,
      transactions // use this in your EJS
    });

  } catch (err) {
    console.error("Error in /transactions route:", err);
    res.redirect("/error-404");
  }
});

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

router.post("/transactions", async (req, res, next) => {
  try {
    const {
      selectedUserId,
      selectedUserType,
      amount,
      paymentType,
      date
    } = req.body;

    const paidAmount = Number(amount);
    const paymentDate = new Date(date);

    if (!selectedUserId || !selectedUserType || isNaN(paidAmount)) {
      return res.status(400).json({ error: "Missing or invalid input" });
    }

    if (selectedUserType === "customer") {
      const customer = await Customer.findById(selectedUserId).populate("branch");
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const branch = customer.branch;
      const branchCode = branch.branch_name.toUpperCase().slice(0, 2);

      // === Generate Receipt Number ===
      const receiptPrefix = `PY-${branchCode}-`;
      const latestLedger = await CustomerLedger.findOne({ refNo: { $regex: `^${receiptPrefix}` } })
        .sort({ createdAt: -1 });

      const nextNum = latestLedger?.refNo?.match(/\d+$/)
        ? parseInt(latestLedger.refNo.match(/\d+$/)[0]) + 1
        : 1;

      const generatedRefNo = `${receiptPrefix}${String(nextNum).padStart(3, "0")}`;

      // === Find last balance ===
      const lastLedger = await CustomerLedger.findOne({ customer: customer._id }).sort({ createdAt: -1 });
      const previousBalance = lastLedger ? lastLedger.Balance || 0 : 0;

      const newBalance = previousBalance + paidAmount;

      // Update customer total debt
      customer.total_debt = newBalance;
      customer.remaining_amount = newBalance;
      await customer.save();

      // === Add payment entry to CustomerLedger ===
      await CustomerLedger.create({
        customer: customer._id,
        branch: customer.branch._id,
        type: "payment",
        refNo: generatedRefNo,
        date: paymentDate,
        amount: 0,
        paid: paidAmount,
        Balance: newBalance
      });

      // === Save to Transaction collection ===
      await Transaction.create({
        transactionType: "Customer",
        branch: customer.branch._id,
        userId: customer._id,
        expectedAmount: previousBalance,
        amountReceived: paidAmount,
        balanceRemaining: newBalance,
        paymentDate,
        paymentType,
        receiptNo: generatedRefNo,
        reference: `Customer payment: ${customer.customer_name}`,
        createdBy: req.user._id // Ensure user is authenticated
      });

      return res.redirect("/transactions?success=1");
    }

    if (selectedUserType === "loan") {
      // Add similar logic here to handle loan ledger & balance if applicable

      // Placeholder for now:
      await Transaction.create({
        transactionType: "Loan",
        branch: req.user.branch, // adjust if needed
        userId: selectedUserId,
        expectedAmount: 0, // Fill with actual logic
        amountReceived: paidAmount,
        balanceRemaining: 0, // Fill with actual logic
        paymentDate,
        paymentType,
        receiptNo: `LN-${Date.now()}`,
        reference: `Loan repayment`,
        createdBy: req.user._id
      });

      return res.redirect("/transactions");
    }

    res.status(400).json({ error: "Unsupported transaction type" });

  } catch (err) {
    console.error("Transaction Error:", err);
    next(err);
  }
});

router.post('/editPayment', async (req, res) => {
  try {
    const { transactionId, newPaidAmount } = req.body;
    const newPaid = parseFloat(newPaidAmount);

    // 1. Find and update original transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    transaction.amountReceived = newPaid;
    const expected = transaction.expectedAmount || 0;
    transaction.balanceRemaining = expected + newPaid;
    await transaction.save();

    // 2. Find and update the corresponding CustomerLedger entry
    const ledgerToEdit = await CustomerLedger.findOne({
      refNo: transaction.receiptNo,
    });

    if (!ledgerToEdit) return res.status(404).json({ error: 'Ledger entry not found' });

    ledgerToEdit.paid = newPaid;
    ledgerToEdit.status = 'edited';
    await ledgerToEdit.save();

    // 3. Get ALL ledger entries for this customer + branch sorted correctly
    const allLedgers = await CustomerLedger.find({
      customer: transaction.customer,
      branch: transaction.branch,
    }).sort({ date: 1, createdAt: 1 });

    // 4. Recalculate running balance from the beginning
    let runningBalance = 0;

    for (let entry of allLedgers) {
      if (entry.type === 'credit-sales') {
        runningBalance -= entry.amount; // invoice reduces balance
      } else if (entry.type === 'payment') {
        runningBalance += entry.paid; // payment increases balance
      }
      entry.Balance = runningBalance;
      await entry.save();
    }

    res.json({ message: 'Payment edited and full ledger recalculated successfully' });

  } catch (err) {
    console.error('Edit Payment Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});





// TRANSACTION ENDS HERE ----------------- TECH MAYOR GROUPS


// REPORTS ROUTE STARTS HERE
router.get("/sales-report", async (req, res) => {
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

    res.render("Report/Sales/sales-report", renderData);
  } catch (err) {
    console.error("Error loading sales-report:", err);
    res.redirect("/error-404");
  }
});

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

router.get("/customer-report", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("//");
  }

  const { customerId, startDate, endDate } = req.query;
  const query = customerId ? { customer: customerId } : null;

  if (startDate && endDate && query) {
    query.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("//");

      const renderView = (ownerBranch, branches = []) => {
        if (query) {
          CustomerLedger.find(query)
            .populate("customer", "customer_name")
            .populate("branch", "branch_name")
            .sort({ date: 1 })
            .then(entries => {
              res.render("Report/Customer/customer-report", {
                user,
                ownerBranch: { branch: ownerBranch },
                branches,
                entries,
                startDate,
                endDate,
                customerId,
              });
            })
            .catch(err => {
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
            });
        } else {
          res.render("Report/Customer/customer-report", {
            user,
            ownerBranch: { branch: ownerBranch },
            branches,
            entries: [],
            startDate,
            endDate,
            customerId,
          });
        }
      };

      if (user.role === 'owner') {
        Branch.findById(user.branch)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => renderView(ownerBranch, allBranches))
              .catch(err => {
                console.error(err);
                res.redirect("/error-404");
              });
          })
          .catch(err => {
            console.error(err);
            res.redirect("/error-404");
          });
      } else {
        renderView(user.branch);
      }
    })
    .catch(err => {
      console.error(err);
      res.redirect("/error-404");
    });
});

router.get("/stock-report", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  try {
    const user = await User.findById(req.user._id).populate("branch");
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
      .sort({ createdAt: 1 })

    console.log("StockLedgers found:", stockLedgers.length);
    console.log(stockLedgers.map(l => ({
      stock_ID: l.stock_ID, particular: l.particular, date: l.date
    })));

    if (user.role === 'owner') {
      const ownerBranch = await Branch.findById(branchId);
      const allBranches = await Branch.find();

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
});


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


router.get("/sold-stock-report", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const { productId, startDate, endDate } = req.query;
    const branchId = user.branch._id;

    const filters = { productId, startDate, endDate }; // add this!

    const stockQuery = {
      branch: branchId,
    };

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

    if (user.role === 'owner') {
      const ownerBranch = await Branch.findById(branchId);
      const allBranches = await Branch.find();

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
});

router.get('/parking-stock-report', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  try {
    const user = await User.findById(req.user._id).populate('branch');
    if (!user) return res.redirect('/');

    const branchId = user.branch._id;

    // Get filters from query params
    const { productId, parkingStoreId, startDate, endDate } = req.query;
    const filters = { productId, parkingStoreId, startDate, endDate };

    // Build the query
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
      if (endDate) ledgerQuery.date.$lte = new Date(endDate);
    }

    // Fetch ledger data
    const parkingStockLedgers = await ParkingStockLedger.find(ledgerQuery)
      .populate('product')
      .populate('parkingStore', 'name')
      .populate('branch', 'branch_name')
      .populate('operator', 'fullname')
      .sort({ date: 1 });

    // Fetch other data for filters / dropdowns
    const parkingStores = await ParkingStore.find({ branch: branchId });
    const products = await Product.find({ branch: branchId });

    res.render('Report/Stock/parking-stock-report', {
      user,
      ownerBranch: { branch: user.branch },
      parkingStockLedgers,
      parkingStores,
      products,
      filters
    });

  } catch (err) {
    console.error(err);
    res.redirect('/error-404');
  }
});

router.get('/purchase-report', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const user = await User.findById(req.user._id).populate('branch');
    if (!user) return res.redirect('/');

    const branchId = user.branch._id || user.branch;
    const { supplierID, supplier, startDate, endDate } = req.query;

    let purchaseReports = []; // default empty
    const filters = { supplier, supplierID, startDate, endDate };  // keep for form

    if (startDate || endDate || supplier || supplierID) {
      const filter = { branch: branchId };

      if (startDate || endDate) {
        filter.payment_date = {};
        if (startDate) filter.payment_date.$gte = new Date(startDate);
        if (endDate) filter.payment_date.$lte = new Date(endDate);
      }

      if (supplierID) {
        // use exact supplier ID if provided
        filter.supplier = supplierID;
      } else if (supplier) {
        // fallback: search by supplier name (correct field is 'supplier')
        const supplierDoc = await Supplier.findOne({ supplier: { $regex: supplier, $options: 'i' } });
        if (supplierDoc) {
          filter.supplier = supplierDoc._id;
        } else {
          // supplier not found → return empty
          return res.render('Report/Purchase/purchase-report', {
            user,
            purchaseReports,
            filters,
            ownerBranch: { branch: user.branch }
          });
        }
      }

      purchaseReports = await ReceivedStock.find(filter)
        .populate('supplier')
        .populate('items.product')
        .sort({ payment_date: -1 });
    }

    const renderData = { user, purchaseReports, filters };

    if (user.role === 'owner') {
      const ownerBranch = await Branch.findById(branchId);
      const allBranches = await Branch.find();
      renderData.ownerBranch = { branch: ownerBranch };
      renderData.branches = allBranches;
    } else {
      renderData.ownerBranch = { branch: user.branch };
    }

    res.render('Report/Purchase/purchase-report', renderData);

  } catch (err) {
    console.error('Error loading purchase-report:', err);
    res.redirect('/error-404');
  }
});

router.get('/supplier-report', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const user = await User.findById(req.user._id).populate('branch');
    if (!user) return res.redirect('/');

    const branchId = user.branch._id || user.branch;
    const { supplierID, supplier, startDate, endDate } = req.query;

    let supplierReports = []; // default empty
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
        const supplierDoc = await Supplier.findOne({ supplier: { $regex: supplier, $options: 'i' } });
        if (supplierDoc) {
          filter.supplier = supplierDoc._id;
        } else {
          // supplier not found → return empty
          return res.render('Report/Supplier/supplier-report', {
            user,
            supplierReports,
            filters,
            ownerBranch: { branch: user.branch }
          });
        }
      }

      supplierReports = await SupplierLedger.find(filter)
        .populate('supplier')
        .sort({ date: 1, createdAt: 1 }); // oldest first for running balance
    }

    const renderData = { user, supplierReports, filters };

    if (user.role === 'owner') {
      const ownerBranch = await Branch.findById(branchId);
      const allBranches = await Branch.find();
      renderData.ownerBranch = { branch: ownerBranch };
      renderData.branches = allBranches;
    } else {
      renderData.ownerBranch = { branch: user.branch };
    }

    res.render('Report/Supplier/supplier-report', renderData);
  } catch (err) {
    console.error('Error loading supplier-report:', err);
    res.redirect('/error-404');
  }
});




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
router.get("/view-log", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const selectedBranchId = req.query.branchId;
    const currentSort = req.query.sort || 'recently';

    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    let branchToFilter = selectedBranchId || user.branch._id;

    let sortQuery = { date: -1 };
    if (currentSort === "ascending") sortQuery = { date: 1 };
    else if (currentSort === "descending") sortQuery = { date: -1 };

    let logQuery = { branch: branchToFilter };

    if (currentSort === "today") {
      const today = new Date();
      today.setHours(0,0,0,0);
      logQuery.date = { $gte: today };
    } else if (currentSort === "lastMonth") {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      logQuery.date = { $gte: lastMonth };
    } else if (currentSort === "last7days") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      logQuery.date = { $gte: sevenDaysAgo };
    }

    let allBranches = [];
    let ownerBranch = null;

    if (user.role === 'owner') {
      allBranches = await Branch.find();
      ownerBranch = await Branch.findById(branchToFilter);
    } else {
      allBranches = [user.branch];
      ownerBranch = user.branch;
    }

    const logs = await ActionLog.find(logQuery)
      .populate('operator')
      .sort(sortQuery);

    res.render("Log/logs", {
      user,
      ownerBranch: { branch: ownerBranch },
      branches: allBranches,
      selectedBranchId: branchToFilter,
      currentSort,
      logs
    });

  } catch (err) {
    console.error("Error fetching logs:", err);
    res.redirect("/error-404");
  }
});



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


module.exports = router;