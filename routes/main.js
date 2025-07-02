const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path')
const multer = require('multer');
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
const Supplier = require("../model/Supplier");
const Loan = require("../model/Loan");
const Product = require("../model/Product");
const Category = require("../model/Category");
const Unit = require("../model/Unit");
const ReceivedStock = require("../model/ReceivedStock");
const StockLedger =  require("../model/StockLedger");
const ParkingStore = require("../model/ParkingStore");
const ParkingStock = require("../model/ParkingStock");
const Config = require('../model/NegSales');
const Notification = require('../model/Notification');
router.use(require("../routes/query"))





// ROUTINGS 
router.get("/dashboard", (req, res) => {
    if (!req.user) return res.redirect("/");
    User.findById(req.user._id)
        .populate("branch")
        .then((user) => {
            if (!user) return res.redirect("/");
            res.render("index", { user });
        })
        .catch((err) => {
            console.error("Error fetching user:", err);
            res.status(500).send("Internal Server Error");
        });
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

            Product.find({ branch: branchToFilter })
              .populate('category')
              .populate('branch')
              .populate('variants.supplier')
              .then(products => {
                res.render("Product/manageProduct", {
                  user,
                  ownerBranch: { branch: user.branch },
                  branches: allBranches,
                  selectedBranchId: branchToFilter,
                  products,
                  units // ✅ pass units to frontend
                });
              });
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
                units // ✅ pass units to frontend
              });
            });
        }

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
  if (!req.isAuthenticated()) return res.redirect('/sign-in');

  try {
    const user = await User.findById(req.user._id).populate('branch');
    const product = await Product.findById(req.params.id).populate('category branch variants.supplier');

    if (!product) return res.redirect('/error-404');

    if (user.role !== 'owner' && !product.branch._id.equals(user.branch._id)) {
      return res.redirect('/unauthorized');
    }

    res.render('Product/editProduct', { user, product });
  } catch (err) {
    console.error(err);
    res.redirect('/error-404');
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

router.post('/addReceiveStock', (req, res, next) => {
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

  const items = [];
  let grandTotal = 0;

  const wrapAsArray = (val) => (Array.isArray(val) ? val : [val]);

  const names = wrapAsArray(item_name);
  const ids = wrapAsArray(product_id);
  const units = wrapAsArray(unitCode);
  const qtys = wrapAsArray(item_qty);
  const rates = wrapAsArray(item_rate);

  const branch = req.user ? req.user.branch : null;

  if (!branch) {
    return res.status(400).send('Branch information is required.');
  }

  let currentIndex = 0;

  function processNextProduct() {
    if (currentIndex >= names.length) {
      return ReceivedStock.create({
        invoice_number,
        supplier,
        branch,
        payment_date,
        items,
        grand_total: grandTotal,
        paid_amount,
        due_amount: grandTotal - paid_amount,
        payment_status
      })
        .then(() => {
          res.redirect('/purchase-stock');
        })
        .catch(err => {
          next(err);
        });
    }

    const qtyNum = parseFloat(qtys[currentIndex]);
    const rateNum = parseFloat(rates[currentIndex]);
    const total = qtyNum * rateNum;
    grandTotal += total;

    items.push({
      product: ids[currentIndex],
      item_name: names[currentIndex],
      unitCode: units[currentIndex],
      item_qty: qtyNum,
      item_rate: rateNum,
      item_total: total
    });

    Product.findById(ids[currentIndex])
      .then(product => {
        if (!product || !product.variants || product.variants.length === 0) return;

        const variants = product.variants;
        const baseIndex = variants.findIndex(v => v.unitCode === units[currentIndex]);
        if (baseIndex === -1) return;

        // Update the quantity of the base unit
        variants[baseIndex].quantity += qtyNum;
        product.supplierPrice = rateNum;

        const baseQty = variants[baseIndex].quantity;

        // Recalculate other variant quantities
        for (let j = 0; j < variants.length; j++) {
          if (j === baseIndex) continue;
          const factor = variants[j].totalInBaseUnit;
          variants[j].quantity = baseQty * factor;
        }

        return product.save().then(saved => {
          // Create a single StockLedger entry per product
          const ledgerEntry = {
            date: new Date(payment_date),
            product: saved._id,
            variants: variants.map(variant => ({
              unitCode: variant.unitCode,
              stock_in: variant.unitCode === units[currentIndex] ? qtyNum : 0,
              stock_out: 0,
              balance: variant.quantity
            })),
            operator: req.user._id,
            branch
          };

          return StockLedger.create(ledgerEntry);
        });
      })
      .then(() => {
        currentIndex++;
        processNextProduct();
      })
      .catch(err => {
        console.error('Error updating product or ledger:', err);
        next(err);
      });
  }

  processNextProduct();
});


// UNIT CODE 
router.get("/addUnit", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const allUnits = await Unit.find().sort({ createdAt: -1 }); // optional: latest first

    if (user.role === 'owner') {
      const ownerBranch = await Branch.findById(user.branch);
      return res.render("Unit/unit", {
        user,
        ownerBranch: { branch: ownerBranch },
        branches: [ownerBranch],
        units: allUnits // 👈 include this
      });
    } else {
      res.render("Unit/unit", {
        user,
        ownerBranch: { branch: user.branch },
        branches: [user.branch],
        units: allUnits // 👈 include this
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

  User.findById(req.user._id)
    .populate("branch")
    .then(user => {
      if (!user) return res.redirect("/");

      const renderCategoryPage = (branchList, ownerBranch) => {
        Category.find()
          .then(categories => {
            res.render("Category/category", {
              user,
              ownerBranch: { branch: ownerBranch },
              branches: branchList,
              categories
            });
          })
          .catch(err => {
            console.error("Error fetching categories:", err);
            res.redirect("/error-404");
          });
      };

      if (user.role === 'owner') {
        Branch.findById(user.branch)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => {
                renderCategoryPage(allBranches, ownerBranch);
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
        renderCategoryPage([user.branch], user.branch);
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

router.post('/addinvoice', (req,res)=>{
  console.log("Received invoice data:", req.body);
  
})
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

      const expiredProducts = await Product.find({
        branch: branchToFilter,
        expDate: { $lt: currentDate }
      }).populate("branch category variants.supplier");

      if (expiredProducts.length > 0) {
        const branch = allBranches.find(b => b._id.equals(branchToFilter));
        const existingNotification = await Notification.findOne({
          type: "expiredStock",
          pageLink: `/expiredProducts?branchId=${branch._id}`,
          isDismissed: false
        });

        if (!existingNotification) {
          await Notification.create({
            title: "Expired Stock Alert",
            description: `There are ${expiredProducts.length} expired product(s) at branch ${branch.branch_name}.`,
            type: "expiredStock",
            pageLink: `/expiredProducts?branchId=${branch._id}`
          });
        }
      }

      return res.render("ExpiredProducts/expiredProducts", {
        user,
        ownerBranch: { branch: user.branch },
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

      // LOW STOCK: products with any variant quantity <= lowStockAlert
      let lowStockProducts = await Product.aggregate([
        { $match: { branch: branchToFilter } },
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
        { $match: { branch: branchToFilter } },
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

      const branch = allBranches.find(b => b._id.equals(branchToFilter));

      // Notification for low stock
      if (lowStockProducts.length > 0) {
        const existingLowStockNotification = await Notification.findOne({
          type: "lowStock",
          pageLink: `/lowStock?branchId=${branch._id}`,
          isDismissed: false
        });
        if (!existingLowStockNotification) {
          await Notification.create({
            title: "Low Stock Alert",
            description: `There are ${lowStockProducts.length} low stock product(s) at branch ${branch.branch_name}.`,
            type: "lowStock",
            pageLink: `/lowStock?branchId=${branch._id}`,
            branch: branch._id
          });
        }
      }

      // Notification for out of stock
      if (outOfStockProducts.length > 0) {
        const existingOutOfStockNotification = await Notification.findOne({
          type: "outOfStock",
          pageLink: `/lowStock?branchId=${branch._id}`,
          isDismissed: false
        });
        if (!existingOutOfStockNotification) {
          await Notification.create({
            title: "Out of Stock Alert",
            description: `There are ${outOfStockProducts.length} completely out of stock product(s) at branch ${branch.branch_name}.`,
            type: "outOfStock",
            pageLink: `/lowStock?branchId=${branch._id}`,
            branch: branch._id
          });
        }
      }

      return res.render("LowStock/low-stock", {
        user,
        ownerBranch: { branch: user.branch },
        branches: allBranches,
        selectedBranchId: branchToFilter,
        lowStockProducts,
        outOfStockProducts
      });
    }

    // STAFF ROUTE
    let lowStockProducts = await Product.aggregate([
      { $match: { branch: user.branch._id } },
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
      { $match: { branch: user.branch._id } },
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







module.exports = router;