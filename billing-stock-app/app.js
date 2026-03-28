const API_BASE = "/api";
const LOW_STOCK = 5;
const MAIN_ID = "main";
const SHOPS = [
  { id: "shop1", name: "Shop 1" },
  { id: "shop2", name: "Shop 2" },
  { id: "shop3", name: "Shop 3" }
];

const state = {
  selectedShopId: "shop1",
  draftLines: [],
  products: [],
  invoices: [],
  summary: null
};

const el = {
  productForm: document.getElementById("product-form"),
  productName: document.getElementById("product-name"),
  productSku: document.getElementById("product-sku"),
  productPrice: document.getElementById("product-price"),
  productStock: document.getElementById("product-stock"),

  invoiceForm: document.getElementById("invoice-form"),
  customerName: document.getElementById("customer-name"),
  customerPhone: document.getElementById("customer-phone"),
  invoiceSku: document.getElementById("invoice-sku"),
  skuList: document.getElementById("sku-list"),
  invoiceQty: document.getElementById("invoice-qty"),
  addLineItem: document.getElementById("add-line-item"),
  invoiceLines: document.getElementById("invoice-lines"),
  invoiceDiscount: document.getElementById("invoice-discount"),
  invoiceTax: document.getElementById("invoice-tax"),
  invoiceTotal: document.getElementById("invoice-total"),

  inventoryBody: document.getElementById("inventory-body"),
  inventoryTotal: document.getElementById("inventory-total"),
  invoicesBody: document.getElementById("invoices-body"),

  exportJson: document.getElementById("export-json"),
  importJson: document.getElementById("import-json"),

  invoiceModal: document.getElementById("invoice-modal"),
  invoicePrint: document.getElementById("invoice-print"),
  printInvoice: document.getElementById("print-invoice"),
  closeInvoice: document.getElementById("close-invoice"),

  shopSelect: null,
  modeLabel: null,
  dashboardCard: null,
  dashboardBody: null,
  shopSummaryCards: null,
  dashTotalSales: null,
  dashTotalInvoices: null,
  dashTotalItems: null,
  shopOnlyCards: []
};

function money(value) {
  return Number(value || 0).toFixed(2);
}

function getShopName(shopId) {
  const shop = SHOPS.find((s) => s.id === shopId);
  return shop ? shop.name : "Unknown Shop";
}

function getStatus(stock) {
  if (stock <= 0) return { text: "Out", level: "danger" };
  if (stock <= LOW_STOCK) return { text: "Low", level: "warn" };
  return { text: "Healthy", level: "ok" };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error((payload && payload.error) || "Request failed.");
  }

  return payload;
}

function resetInvoiceForm() {
  state.draftLines = [];
  el.invoiceForm.reset();
  el.invoiceQty.value = "1";
  el.invoiceDiscount.value = "0";
  el.invoiceTax.value = "0";
  renderDraftLines();
}

function bootstrapUi() {
  const headerTitle = document.querySelector(".app-header h1");
  const headerSubtitle = document.querySelector(".app-header p");
  if (headerTitle) headerTitle.textContent = "WEST LINING POINT";
  if (headerSubtitle) headerSubtitle.textContent = "Billing + Stock Manager";

  if (el.exportJson && el.importJson) {
    const actions = el.exportJson.closest(".actions");
    if (actions) actions.style.display = "none";
  }

  const container = document.querySelector("main.container");
  if (!container) return;

  el.shopOnlyCards = Array.from(container.querySelectorAll(":scope > section.card"));

  const modeCard = document.createElement("section");
  modeCard.className = "card";
  modeCard.innerHTML = `
    <h2>Shop View</h2>
    <div class="grid-form">
      <select id="shop-select"></select>
      <p id="mode-label" class="muted"></p>
    </div>
  `;

  const dashboardCard = document.createElement("section");
  dashboardCard.className = "card hidden";
  dashboardCard.id = "dashboard-card";
  dashboardCard.innerHTML = `
    <h2>Main Dashboard</h2>
    <div class="stats-grid">
      <article class="stat-box"><h3>Total Sales</h3><p id="dash-total-sales">0.00</p></article>
      <article class="stat-box"><h3>Total Invoices</h3><p id="dash-total-invoices">0</p></article>
      <article class="stat-box"><h3>Total Items Left</h3><p id="dash-total-items">0</p></article>
    </div>
    <div id="shop-summary-cards" class="shop-summary-grid"></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Shop</th>
            <th>Sales</th>
            <th>Invoices</th>
            <th>Items Left</th>
          </tr>
        </thead>
        <tbody id="dashboard-body"></tbody>
      </table>
    </div>
  `;

  container.prepend(dashboardCard);
  container.prepend(modeCard);

  el.shopSelect = document.getElementById("shop-select");
  el.modeLabel = document.getElementById("mode-label");
  el.dashboardCard = document.getElementById("dashboard-card");
  el.dashboardBody = document.getElementById("dashboard-body");
  el.shopSummaryCards = document.getElementById("shop-summary-cards");
  el.dashTotalSales = document.getElementById("dash-total-sales");
  el.dashTotalInvoices = document.getElementById("dash-total-invoices");
  el.dashTotalItems = document.getElementById("dash-total-items");
}

function renderShopSelector() {
  if (!el.shopSelect) return;
  el.shopSelect.innerHTML = "";

  const mainOpt = document.createElement("option");
  mainOpt.value = MAIN_ID;
  mainOpt.textContent = "Main Dashboard";
  el.shopSelect.appendChild(mainOpt);

  SHOPS.forEach((shop) => {
    const option = document.createElement("option");
    option.value = shop.id;
    option.textContent = shop.name;
    el.shopSelect.appendChild(option);
  });

  el.shopSelect.value = state.selectedShopId;
}

function renderDashboard() {
  if (!state.summary || !el.dashboardBody || !el.shopSummaryCards) return;

  const shops = state.summary.shops || [];
  const totals = state.summary.totals || { sales: 0, invoices: 0, itemsLeft: 0 };

  el.dashboardBody.innerHTML = "";
  el.shopSummaryCards.innerHTML = "";

  shops.forEach((shop) => {
    const card = document.createElement("article");
    card.className = "shop-summary-card";
    card.innerHTML = `
      <h3>${shop.name}</h3>
      <p class="tap-link" data-action="view-sales" data-shop-id="${shop.id}"><strong>Sales:</strong> ${money(shop.sales)}</p>
      <p class="tap-link" data-action="view-stock" data-shop-id="${shop.id}"><strong>Stock Left:</strong> ${shop.itemsLeft}</p>
    `;
    el.shopSummaryCards.appendChild(card);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${shop.name}</td>
      <td class="tap-link" data-action="view-sales" data-shop-id="${shop.id}">${money(shop.sales)}</td>
      <td>${shop.invoices}</td>
      <td class="tap-link" data-action="view-stock" data-shop-id="${shop.id}">${shop.itemsLeft}</td>
    `;
    el.dashboardBody.appendChild(row);
  });

  el.dashTotalSales.textContent = money(totals.sales);
  el.dashTotalInvoices.textContent = String(totals.invoices || 0);
  el.dashTotalItems.textContent = String(totals.itemsLeft || 0);
}

function renderMode() {
  const isMain = state.selectedShopId === MAIN_ID;

  if (el.dashboardCard) {
    el.dashboardCard.classList.toggle("hidden", !isMain);
  }

  el.shopOnlyCards.forEach((card) => {
    card.classList.toggle("hidden", isMain);
  });

  if (el.modeLabel) {
    el.modeLabel.textContent = isMain
      ? "Viewing all three shops from main dashboard."
      : `Working in ${getShopName(state.selectedShopId)}.`;
  }
}

function renderProductOptions() {
  if (!el.skuList) return;
  el.skuList.innerHTML = "";
  state.products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.sku;
    el.skuList.appendChild(option);
  });
}

function renderInventory() {
  el.inventoryBody.innerHTML = "";
  const totalStock = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  if (el.inventoryTotal) {
    el.inventoryTotal.textContent = `Total Stocks Available: ${totalStock}`;
  }

  state.products.forEach((product) => {
    const status = getStatus(Number(product.stock || 0));
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.sku}</td>
      <td>${money(product.price)}</td>
      <td>${product.stock}</td>
      <td><span class="badge ${status.level}">${status.text}</span></td>
    `;
    el.inventoryBody.appendChild(row);
  });
}

function renderDraftLines() {
  el.invoiceLines.innerHTML = "";

  state.draftLines.forEach((line, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${line.name}</td>
      <td>${line.qty}</td>
      <td>${money(line.price)}</td>
      <td>${money(line.total)}</td>
      <td><button class="small-btn" data-remove-line="${index}" type="button">Remove</button></td>
    `;
    el.invoiceLines.appendChild(row);
  });

  const subtotal = state.draftLines.reduce((sum, line) => sum + Number(line.total || 0), 0);
  const discount = Number(el.invoiceDiscount.value || 0);
  const taxRate = Number(el.invoiceTax.value || 0);
  const afterDiscount = Math.max(subtotal - discount, 0);
  const taxAmount = (afterDiscount * taxRate) / 100;
  const total = afterDiscount + taxAmount;

  el.invoiceTotal.textContent = `Grand Total: ${money(total)}`;
}

function renderInvoices() {
  el.invoicesBody.innerHTML = "";

  state.invoices.forEach((invoice) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${invoice.number}</td>
      <td>${new Date(invoice.created_at).toLocaleString()}</td>
      <td>${invoice.customer_name}</td>
      <td>${money(invoice.total)}</td>
      <td><button type="button" class="small-btn" data-view-invoice="${invoice.id}">View</button></td>
    `;
    el.invoicesBody.appendChild(row);
  });
}

function showDashboardReport(title, lines) {
  const body = lines.length ? lines.join("\n") : "No records found.";
  el.invoicePrint.textContent = `${title}\n${"-".repeat(title.length)}\n\n${body}`;
  el.invoiceModal.showModal();
}

function invoiceText(invoice) {
  const lines = (invoice.lines || [])
    .map((line) => `${line.name} | Qty: ${line.qty} | Price: ${money(line.price)} | Total: ${money(line.total)}`)
    .join("\n");

  return [
    "WEST LINING POINT",
    getShopName(invoice.shop_id || state.selectedShopId),
    "-----------------",
    `Invoice No: ${invoice.number}`,
    `Date: ${new Date(invoice.created_at).toLocaleString()}`,
    `Customer: ${invoice.customer_name || "-"}`,
    `Phone: ${invoice.customer_phone || "-"}`,
    "",
    "Items:",
    lines,
    "",
    `Subtotal: ${money(invoice.subtotal)}`,
    `Discount: ${money(invoice.discount)}`,
    `Tax (${money(invoice.tax_rate)}%): ${money(invoice.tax_amount)}`,
    `Grand Total: ${money(invoice.total)}`
  ].join("\n");
}

function showInvoice(invoiceId) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return;
  el.invoicePrint.textContent = invoiceText(invoice);
  el.invoiceModal.showModal();
}

async function loadSummary() {
  const data = await api("/shops/summary");
  state.summary = data;
}

async function loadShopData(shopId) {
  const [productsRes, invoicesRes] = await Promise.all([
    api(`/shops/${shopId}/products`),
    api(`/shops/${shopId}/invoices`)
  ]);

  state.products = productsRes.items || [];
  state.invoices = invoicesRes.items || [];
}

async function refresh() {
  renderShopSelector();
  renderMode();

  await loadSummary();
  renderDashboard();

  if (state.selectedShopId !== MAIN_ID) {
    await loadShopData(state.selectedShopId);
    renderProductOptions();
    renderInventory();
    renderDraftLines();
    renderInvoices();
  }
}

function addDraftLine() {
  const typedSku = (el.invoiceSku.value || "").trim().toLowerCase();
  const product = state.products.find((item) => String(item.sku).trim().toLowerCase() === typedSku);
  const qty = Number(el.invoiceQty.value || 0);

  if (!product || qty <= 0) {
    alert("Enter a valid SKU and quantity.");
    return;
  }

  if (qty > Number(product.stock || 0)) {
    alert("Not enough stock available.");
    return;
  }

  state.draftLines.push({
    productId: product.id,
    name: product.name,
    qty,
    price: Number(product.price),
    total: Number(product.price) * qty
  });

  el.invoiceSku.value = "";
  el.invoiceQty.value = "1";
  el.invoiceSku.focus();
  renderDraftLines();
}

function removeDraftLine(index) {
  state.draftLines.splice(index, 1);
  renderDraftLines();
}

async function onAddProduct(event) {
  event.preventDefault();
  if (state.selectedShopId === MAIN_ID) return;

  try {
    await api(`/shops/${state.selectedShopId}/products`, {
      method: "POST",
      body: JSON.stringify({
        name: el.productName.value.trim(),
        sku: el.productSku.value.trim(),
        price: Number(el.productPrice.value || 0),
        stock: Number(el.productStock.value || 0)
      })
    });

    el.productForm.reset();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

async function onGenerateInvoice(event) {
  event.preventDefault();
  if (state.selectedShopId === MAIN_ID) return;

  if (!el.customerName.value.trim()) {
    alert("Customer name is required.");
    return;
  }

  if (!state.draftLines.length) {
    alert("Add at least one line item.");
    return;
  }

  try {
    const payload = {
      customerName: el.customerName.value.trim(),
      customerPhone: el.customerPhone.value.trim(),
      lines: state.draftLines.map((line) => ({ productId: line.productId, qty: line.qty })),
      discount: Number(el.invoiceDiscount.value || 0),
      taxRate: Number(el.invoiceTax.value || 0)
    };

    const result = await api(`/shops/${state.selectedShopId}/invoices`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    resetInvoiceForm();
    await refresh();

    if (result && result.invoice) {
      el.invoicePrint.textContent = invoiceText(result.invoice);
      el.invoiceModal.showModal();
    }
  } catch (error) {
    alert(error.message);
  }
}

async function showTodaySalesByItem(shopId) {
  try {
    const result = await api(`/shops/${shopId}/sales/today`);
    const shopName = getShopName(shopId);

    const lines = [];
    lines.push(`Date: ${result.date}`);
    lines.push("");

    if (!result.invoices.length) {
      lines.push("No sales found for today.");
    } else {
      result.invoices.forEach((invoice, index) => {
        lines.push(`Invoice: ${invoice.number}`);
        lines.push(`Time: ${new Date(invoice.created_at).toLocaleTimeString()}`);
        lines.push(`Customer: ${invoice.customer_name || "-"}`);
        lines.push("Items:");
        invoice.lines.forEach((line) => {
          lines.push(`  - ${line.name} | Qty: ${line.qty} | Price: ${money(line.price)} | Total: ${money(line.total)}`);
        });
        lines.push(`Bill Total: ${money(invoice.total)}`);
        if (index < result.invoices.length - 1) lines.push("--------------------------------");
      });
    }

    lines.push("");
    lines.push(`Today's Invoice Count: ${result.invoiceCount}`);
    lines.push(`Today's Items Sold: ${result.itemsSold}`);
    lines.push(`Today's Total Sales: ${money(result.totalSales)}`);

    showDashboardReport(`${shopName} - Today's Full Sales Details`, lines);
  } catch (error) {
    alert(error.message);
  }
}

async function showStockBySku(shopId) {
  try {
    const result = await api(`/shops/${shopId}/stock`);
    const shopName = getShopName(shopId);
    const lines = (result.items || []).map((item) => `${item.sku} | ${item.name} | Qty Left: ${item.stock}`);
    showDashboardReport(`${shopName} - Stock Left (SKU Order)`, lines);
  } catch (error) {
    alert(error.message);
  }
}

el.productForm.addEventListener("submit", onAddProduct);
el.addLineItem.addEventListener("click", addDraftLine);
el.invoiceSku.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addDraftLine();
  }
});
el.invoiceDiscount.addEventListener("input", renderDraftLines);
el.invoiceTax.addEventListener("input", renderDraftLines);
el.invoiceForm.addEventListener("submit", onGenerateInvoice);
el.closeInvoice.addEventListener("click", () => el.invoiceModal.close());
el.printInvoice.addEventListener("click", () => window.print());

el.invoiceLines.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const idx = target.getAttribute("data-remove-line");
  if (idx !== null) removeDraftLine(Number(idx));
});

el.invoicesBody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.getAttribute("data-view-invoice");
  if (id) showInvoice(id);
});

bootstrapUi();

if (el.dashboardCard) {
  el.dashboardCard.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const node = target.closest("[data-action][data-shop-id]");
    if (!(node instanceof HTMLElement)) return;
    const action = node.getAttribute("data-action");
    const shopId = node.getAttribute("data-shop-id");
    if (!action || !shopId) return;

    if (action === "view-sales") showTodaySalesByItem(shopId);
    if (action === "view-stock") showStockBySku(shopId);
  });
}

if (el.shopSelect) {
  el.shopSelect.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.selectedShopId = target.value;
    resetInvoiceForm();
    await refresh();
  });
}

refresh().catch((error) => {
  alert(`Server connection error: ${error.message}`);
});
