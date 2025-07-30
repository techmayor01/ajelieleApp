const express = require("express");
const router = express.Router();
const numberToWords = require('number-to-words');




const User = require("../model/User");
const Branch = require("../model/Branch");
const Customer = require("../model/Customer");
const CustomerLedger = require("../model/CustomerLedger");
const SalesLedger = require('../model/SalesLedger');
const Invoice = require('../model/Invoice');
const Transaction = require('../model/Transaction');
const Config = require('../model/NegSales');
const Product = require("../model/Product");
const StockLedger = require("../model/StockLedger");



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
const previousLedger = await CustomerLedger.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(1);
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



// HANDLING PAYMENT TRANSACTIONS HERE ----------------- TECH MAYOR GROUPS 
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
    const roundToTwo = num => Math.round((num + Number.EPSILON) * 100) / 100;

    const {
      transactionId,
      newPaidAmount,
      PaidAmount,
      date
    } = req.body;

    const paymentDate = new Date(date);

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const { userId, receiptNo, branch } = transaction;
    const customer = await Customer.findById(userId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const oldPaid = roundToTwo(parseFloat(PaidAmount));
    const newPaid = roundToTwo(parseFloat(newPaidAmount));

    const lastLedger = await CustomerLedger.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(1);
    const lastBalance = lastLedger.length ? roundToTwo(lastLedger[0].Balance) : 0;

    const balanceAfterReversal = roundToTwo(lastBalance - oldPaid);
    await CustomerLedger.create({
      customer: customer._id,
      branch: branch,
      type: 'credit-sales',
      refNo: `${receiptNo}`,
      date: paymentDate,
      amount: oldPaid,
      paid: 0,
      Balance: balanceAfterReversal,
      status: 'edited'
    });

    const finalBalance = roundToTwo(balanceAfterReversal + newPaid);
    await CustomerLedger.create({
      customer: customer._id,
      branch: branch,
      type: 'payment',
      refNo: receiptNo,
      date: paymentDate,
      amount: 0,
      paid: newPaid,
      Balance: finalBalance,
      status: 'normal'
    });

    customer.remaining_amount = finalBalance;
    customer.total_debt = finalBalance;
    await customer.save();

    transaction.amountReceived = newPaid;
    transaction.balanceRemaining = finalBalance;
    transaction.paymentDate = paymentDate;
    await transaction.save();

    return res.redirect('/transactions');
  } catch (err) {
    console.error('Edit Payment Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/deletePayment', async (req, res) => {
  try {
    const { transactionId } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const { userId, amountReceived, receiptNo, paymentDate, branch } = transaction;

    const customer = await Customer.findById(userId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const oldLedger = await CustomerLedger.findOne({
      refNo: receiptNo,
      customer: userId,
      status: 'normal'
    });

    if (!oldLedger) return res.status(404).json({ error: 'Ledger not found' });

    // 1. Mark old ledger as deleted
    oldLedger.status = 'deleted';
    await oldLedger.save();

    // 2. Calculate new balance
    const updatedBalance = customer.total_debt - amountReceived;

    // 3. Update customer balances
    customer.total_debt = updatedBalance;
    customer.remaining_amount = updatedBalance;
    await customer.save();

    // 4. Create a new ledger entry to reflect this update
    await CustomerLedger.create({
      customer: customer._id,
      branch: branch,
      type: 'payment',
      refNo: receiptNo, // or `${receiptNo}-DEL`
      date: paymentDate,
      amount: 0,
      paid: 0,
      Balance: updatedBalance,
      status: 'normal'
    });

    // 5. Optionally delete or soft-delete the transaction
    await Transaction.findByIdAndDelete(transactionId);

    return res.redirect('/transactions?deleted=1');
  } catch (err) {
    console.error('Delete Payment Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// RECEIPT OF PAYMENT 
router.get('/cash-receipt/:cashId', async (req, res, next) => {
  try {
    const cashReceipt = await Transaction.findById(req.params.cashId)
      .populate('branch')
      .populate('createdBy')
      .populate('userId');

    if (!cashReceipt) {
      return res.status(404).send('Receipt not found');
    }

    const branch = cashReceipt.branch;
    const isHeadOffice = branch?.isHeadOffice;
    const creator = cashReceipt.createdBy;

    const totalInWords = numberToWords.toWords(cashReceipt.amountReceived)
      .replace(/\b\w/g, l => l.toUpperCase());

    let headOffice = null;

    if (!isHeadOffice) {
      headOffice = await Branch.findOne({ isHeadOffice: true });
    }

    res.render('Transaction/receipt', {
      receipt: cashReceipt,
      branch,
      creator,
      customerOrLoan: cashReceipt.userId,
      isHeadOffice,
      headOffice,
      totalInWords
    });

  } catch (err) {
    next(err);
  }
});

// SALES INVOICE EDIT ----------------------- TECH MAYOR GROUPS 



router.post("/update-invoice", async (req, res) => {
  console.log("Update Invoice Request:", req.body);
});




module.exports = router;