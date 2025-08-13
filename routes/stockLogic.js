const express = require("express");
const router = express.Router();

const User = require("../model/User");
const Branch = require("../model/Branch");
const ParkingStore = require("../model/ParkingStore");
const ParkingStock = require("../model/ParkingStock");
const Product = require("../model/Product");
const StockLedger = require("../model/StockLedger");
const ParkingStockLedger = require("../model/ParkingStockLedger");
const checkPermission = require("../Utils/checkPermission");

router.post('/addParkingStock', async (req, res) => {
  const {
    branch,
    date,
    parkingStoreId,
    productId,
    unitCode,
    quantity
  } = req.body;

  const operator = req.user?._id;
  const stock_ID = `PARK-${Date.now()}`;

  if (!Array.isArray(productId) || !Array.isArray(unitCode) || !Array.isArray(quantity)) {
    return res.status(400).send("Invalid data structure from form.");
  }

  try {
    const parkingStore = await ParkingStore.findById(parkingStoreId);
    if (!parkingStore) return res.status(404).send("Parking store not found.");

    for (let i = 0; i < productId.length; i++) {
      const productDoc = await Product.findById(productId[i]);
      if (!productDoc) continue;

      const qty = parseFloat(quantity[i]);
      const selectedUnit = unitCode[i];
      const selectedVariant = productDoc.variants.find(v => v.unitCode === selectedUnit);
      if (!selectedVariant || selectedVariant.quantity < qty) continue;

      // Deduct from main stock
      selectedVariant.quantity -= qty;

      const baseQty = productDoc.variants[0].unitCode === selectedUnit
        ? selectedVariant.quantity
        : selectedVariant.quantity / selectedVariant.totalInBaseUnit;

      productDoc.variants.forEach((v, idx) => {
        v.quantity = idx === 0 ? baseQty : baseQty * v.totalInBaseUnit;
      });

      await productDoc.save();

      // === Log to StockLedger ===
      await StockLedger.create({
        date,
        product: productDoc._id,
        operator,
        branch,
        stock_ID,
        customer: parkingStore.storeName,
        customer_id: parkingStore._id,
        particular: "Moved to Parking Stock",
        variants: productDoc.variants.map(v => ({
          unitCode: v.unitCode,
          stock_in: 0,
          stock_out: v.unitCode === selectedUnit ? qty : 0,
          balance: v.quantity,
          cost_price: productDoc.supplierPrice || 0,
          total_sales: 0
        }))
      });

      // === ParkingStockLedger balance ===
      const latestLedger = await ParkingStockLedger.findOne({
        parkingStore: parkingStoreId,
        product: productDoc._id,
        branch,
        "variants.unitCode": selectedUnit
      }).sort({ date: -1, _id: -1 });

      const previousBalance = latestLedger?.variants.find(v => v.unitCode === selectedUnit)?.balance || 0;
      const newBalance = previousBalance + qty;

      // === Create ParkingStockLedger ===
      await ParkingStockLedger.create({
        date,
        parkingStore: parkingStoreId,
        product: productDoc._id,
        operator,
        branch,
        particular: "Received from Main Store",
        stock_ID,
        particulars: "Parking stock created from main store transfer",
        variants: [{
          unitCode: selectedUnit,
          stock_in: qty,
          stock_out: 0,
          balance: newBalance
        }]
      });

      // === Update/Create ParkingStock ===
      const existingParkingStock = await ParkingStock.findOne({
        parkingStore: parkingStoreId,
        branch,
        product: productDoc._id,
        unitCode: selectedUnit
      });

      if (existingParkingStock) {
        existingParkingStock.quantity += qty;
        existingParkingStock.parkedAt = new Date();
        await existingParkingStock.save();
      } else {
        await ParkingStock.create({
          parkingStore: parkingStoreId,
          branch,
          product: productDoc._id,
          unitCode: selectedUnit,
          quantity: qty,
          parkedBy: operator
        });
      }
    }

    res.redirect('/manageParkingStore');
  } catch (err) {
    console.error("Error adding to parking stock:", err);
    res.status(500).send("Server error.");
  }
});


router.post('/moveOutParkingStock', async (req, res) => {
  const {
    branch,
    date,
    parkingStoreId,
    productId,
    unitCode,
    quantity
  } = req.body;

  const operator = req.user?._id;
  const stock_ID = `PARK-MOVE-${Date.now()}`;

  if (!Array.isArray(productId) || !Array.isArray(unitCode) || !Array.isArray(quantity)) {
    return res.status(400).send("Invalid data structure from form.");
  }

  try {
    const parkingStore = await ParkingStore.findById(parkingStoreId);
    if (!parkingStore) return res.status(404).send("Parking store not found.");

    for (let i = 0; i < productId.length; i++) {
      const productDoc = await Product.findById(productId[i]);
      if (!productDoc) continue;

      const qty = parseFloat(quantity[i]);
      const selectedUnit = unitCode[i];
      const selectedVariant = productDoc.variants.find(v => v.unitCode === selectedUnit);
      if (!selectedVariant) continue;

      const latestLedger = await ParkingStockLedger.findOne({
        parkingStore: parkingStoreId,
        product: productDoc._id,
        branch,
        "variants.unitCode": selectedUnit
      }).sort({ date: -1, _id: -1 });

      const previousBalance = latestLedger?.variants.find(v => v.unitCode === selectedUnit)?.balance || 0;
      if (previousBalance < qty) continue;

      const newBalance = previousBalance - qty;

      // Log to ParkingStockLedger
      await ParkingStockLedger.create({
        date,
        parkingStore: parkingStoreId,
        product: productDoc._id,
        operator,
        branch,
        particular: "Returned to Main Store",
        stock_ID,
        particulars: "Parking stock moved back to main store",
        variants: [{
          unitCode: selectedUnit,
          stock_in: 0,
          stock_out: qty,
          balance: newBalance
        }]
      });

      // Add back to main stock
      selectedVariant.quantity += qty;

      const baseQty = productDoc.variants[0].unitCode === selectedUnit
        ? selectedVariant.quantity
        : selectedVariant.quantity / selectedVariant.totalInBaseUnit;

      productDoc.variants.forEach((v, idx) => {
        v.quantity = idx === 0 ? baseQty : baseQty * v.totalInBaseUnit;
      });

      await productDoc.save();

      // Log to StockLedger
      await StockLedger.create({
        date,
        product: productDoc._id,
        operator,
        branch,
        stock_ID,
        customer: parkingStore.storeName,
        customer_id: parkingStore._id,
        particular: "Returned from Parking Stock",
        variants: productDoc.variants.map(v => ({
          unitCode: v.unitCode,
          stock_in: v.unitCode === selectedUnit ? qty : 0,
          stock_out: 0,
          balance: v.quantity,
          cost_price: productDoc.supplierPrice || 0,
          total_sales: 0
        }))
      });

      // Update or delete ParkingStock
      const existingParkingStock = await ParkingStock.findOne({
        parkingStore: parkingStoreId,
        branch,
        product: productDoc._id,
        unitCode: selectedUnit
      });

      if (existingParkingStock) {
        existingParkingStock.quantity -= qty;
        if (existingParkingStock.quantity <= 0) {
          await existingParkingStock.deleteOne();
        } else {
          existingParkingStock.parkedAt = new Date();
          await existingParkingStock.save();
        }
      }
    }

    res.redirect('/manageParkingStore');
  } catch (err) {
    console.error("Error moving out from parking stock:", err);
    res.status(500).send("Server error.");
  }
});


router.get("/viewStore/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const selectedBranchId = req.query.branchId;

  try {
    const user = await User.findById(req.user._id).populate("branch");
    if (!user) return res.redirect("/");

    const store = await ParkingStore.findById(req.params.id);
    if (!store) return res.redirect("/error-404");

    let allBranches = [];
    let selectedBranch;

    if (user.role === "owner") {
      allBranches = await Branch.find();
      selectedBranch = selectedBranchId
        ? allBranches.find(b => b._id.equals(selectedBranchId))
        : user.branch;
    } else {
      allBranches = [user.branch];
      selectedBranch = user.branch;
    }

    const branchToUse = selectedBranch?._id;

    const stock = await ParkingStock.find({
      parkingStore: req.params.id,
      branch: branchToUse
    })
      .populate({
        path: "product",
        select: "product"
      })
      .populate({
        path: "branch",
        select: "branch_name"
      })
      .populate({
        path: "parkingStore",
        select: "storeName"
      });

    res.render("Store/parkingStock", {
      user,
      ownerBranch: { branch: selectedBranch },
      branches: allBranches,
      selectedBranchId: branchToUse,
      store,
      stock
    });
  } catch (err) {
    console.error("Error in viewStore:", err);
    res.redirect("/error-404");
  }
});

router.post('/editParkingStock', async (req, res) => {
  try {
    const {
      parkingStockId,
      parkingStoreId,
      unitCode,
      product,
      action,
      quantity,
      reason
    } = req.body;

    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return res.status(400).send("Invalid quantity.");

    const operator = req.user?._id;
    const stock_ID = `EDIT-${Date.now()}`;

    const parkingStock = await ParkingStock.findById(parkingStockId).populate('product');
    if (!parkingStock) return res.status(404).send("Parking stock not found.");

    const productDoc = await Product.findById(parkingStock.product._id);
    if (!productDoc) return res.status(404).send("Product not found.");

    const branch = parkingStock.branch;
    const selectedVariant = productDoc.variants.find(v => v.unitCode === unitCode);
    if (!selectedVariant) return res.status(400).send("Invalid unit code.");

    let newParkingBalance = parkingStock.quantity;
    if (action === 'reduce') {
      if (newParkingBalance < qty) return res.status(400).send("Insufficient stock.");
      newParkingBalance -= qty;
    } else {
      newParkingBalance += qty;
    }

    // === Update ParkingStock ===
    parkingStock.quantity = newParkingBalance;
    parkingStock.parkedAt = new Date();
    await parkingStock.save();

    // === Adjust Product Main Stock ===
    if (action === 'reduce') {
      selectedVariant.quantity += qty;
    } else {
      if (selectedVariant.quantity < qty) return res.status(400).send("Not enough main stock to reduce.");
      selectedVariant.quantity -= qty;
    }

    const baseQty = productDoc.variants[0].unitCode === unitCode
      ? selectedVariant.quantity
      : selectedVariant.quantity / selectedVariant.totalInBaseUnit;

    productDoc.variants.forEach((v, idx) => {
      v.quantity = idx === 0 ? baseQty : baseQty * v.totalInBaseUnit;
    });

    await productDoc.save();

    // === Recalculate ParkingStockLedger balance ===
    const latestParkingLedger = await ParkingStockLedger.findOne({
      parkingStore: parkingStoreId,
      product: productDoc._id,
      branch,
      "variants.unitCode": unitCode
    }).sort({ date: -1, _id: -1 });

    const prevParkingBal = latestParkingLedger?.variants.find(v => v.unitCode === unitCode)?.balance || 0;
    const newLedgerParkingBalance = action === 'increase' ? prevParkingBal + qty : prevParkingBal - qty;

    // === Log to ParkingStockLedger ===
    await ParkingStockLedger.create({
      date: new Date(),
      parkingStore: parkingStoreId,
      product: productDoc._id,
      operator,
      branch,
      stock_ID,
      particular: `Edited parking stock - ${action}`,
      status: 'edited',
      variants: [{
        unitCode,
        stock_in: action === 'increase' ? qty : 0,
        stock_out: action === 'reduce' ? qty : 0,
        balance: newLedgerParkingBalance
      }]
    });

    // === Log to StockLedger ===
    await StockLedger.create({
      date: new Date(),
      product: productDoc._id,
      operator,
      branch,
      stock_ID,
      customer: parkingStock.parkingStore?.storeName || 'Parking Store',
      particular: `Edited parking stock - ${action}`,
      status: 'edited',
      variants: productDoc.variants.map(v => ({
        unitCode: v.unitCode,
        stock_in: action === 'reduce' && v.unitCode === unitCode ? qty : 0,
        stock_out: action === 'increase' && v.unitCode === unitCode ? qty : 0,
        balance: v.quantity,
        cost_price: productDoc.supplierPrice || 0,
        total_sales: 0
      }))
    });

    res.redirect('/manageParkingStore');
  } catch (err) {
    console.error("Error editing parking stock:", err);
    res.status(500).send("Server error.");
  }
});

router.post('/delete-parking-stock', async (req, res) => {
  try {
    const { id } = req.body; // parkingStock._id

    const operator = req.user?._id;
    const stock_ID = `DEL-${Date.now()}`;

    const parkingStock = await ParkingStock.findById(id).populate('product');
    if (!parkingStock) return res.status(404).send("Parking stock not found.");

    const productDoc = await Product.findById(parkingStock.product._id);
    if (!productDoc) return res.status(404).send("Product not found.");

    const branch = parkingStock.branch;
    const parkingStoreId = parkingStock.parkingStore;
    const unitCode = parkingStock.unitCode;
    const qty = parseFloat(parkingStock.quantity);

    if (!qty || qty <= 0) return res.status(400).send("Invalid stock quantity.");

    const selectedVariant = productDoc.variants.find(v => v.unitCode === unitCode);
    if (!selectedVariant) return res.status(400).send("Invalid unit code.");

    // === Adjust main stock ===
    selectedVariant.quantity += qty;

    const baseQty = productDoc.variants[0].unitCode === unitCode
      ? selectedVariant.quantity
      : selectedVariant.quantity / selectedVariant.totalInBaseUnit;

    productDoc.variants.forEach((v, idx) => {
      v.quantity = idx === 0 ? baseQty : baseQty * v.totalInBaseUnit;
    });

    await productDoc.save();

    // === Recalculate last ledger balance ===
    const latestParkingLedger = await ParkingStockLedger.findOne({
      parkingStore: parkingStoreId,
      product: productDoc._id,
      branch,
      "variants.unitCode": unitCode
    }).sort({ date: -1, _id: -1 });

    const prevParkingBal = latestParkingLedger?.variants.find(v => v.unitCode === unitCode)?.balance || 0;
    const newParkingBalance = prevParkingBal - qty;

    // === ParkingStockLedger (stock_out, status: deleted) ===
    await ParkingStockLedger.create({
      date: new Date(),
      parkingStore: parkingStoreId,
      product: productDoc._id,
      operator,
      branch,
      stock_ID,
      particular: `Deleted parking stock`,
      status: 'deleted',
      variants: [{
        unitCode,
        stock_in: 0,
        stock_out: qty,
        balance: newParkingBalance
      }]
    });

    // === StockLedger (stock_in, status: deleted) ===
    await StockLedger.create({
      date: new Date(),
      product: productDoc._id,
      operator,
      branch,
      stock_ID,
      customer: parkingStock.parkingStore?.storeName || 'Parking Store',
      particular: `Deleted parking stock`,
      status: 'deleted',
      variants: productDoc.variants.map(v => ({
        unitCode: v.unitCode,
        stock_in: v.unitCode === unitCode ? qty : 0,
        stock_out: 0,
        balance: v.quantity,
        cost_price: productDoc.supplierPrice || 0,
        total_sales: 0
      }))
    });

    // === Remove actual stock ===
    await ParkingStock.findByIdAndDelete(id);

    res.redirect('/manageParkingStore');
  } catch (err) {
    console.error("Error deleting parking stock:", err);
    res.status(500).send("Server error.");
  }
});



module.exports = router;