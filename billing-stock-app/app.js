const API_BASE = "/api";
const LOW_STOCK = 5;
const MAIN_ID = "main";
const AUTH_TOKEN_KEY = "billing_auth_token_v1";
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
  summary: null,
  authToken: "",
  authUser: null,
  activeInvoice: null
};

const el = {
  appMain: document.getElementById("app-main"),
  authCard: document.getElementById("auth-card"),
  loginForm: document.getElementById("login-form"),
  loginUid: document.getElementById("login-uid"),
  loginPassword: document.getElementById("login-password"),
  logoutBtn: document.getElementById("logout-btn"),

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
  invoicePrice: document.getElementById("invoice-price"),
  addLineItem: document.getElementById("add-line-item"),
  invoiceLines: document.getElementById("invoice-lines"),
  invoiceDiscount: document.getElementById("invoice-discount"),
  invoiceTax: document.getElementById("invoice-tax"),
  invoiceTotal: document.getElementById("invoice-total"),

  inventoryPanel: document.getElementById("inventory-panel"),
  inventorySearch: document.getElementById("inventory-search"),
  inventoryBody: document.getElementById("inventory-body"),
  inventoryTotal: document.getElementById("inventory-total"),
  restockQuery: document.getElementById("restock-query"),
  restockList: document.getElementById("restock-list"),
  restockQty: document.getElementById("restock-qty"),
  restockAddBtn: document.getElementById("restock-add-btn"),
  invoicesBody: document.getElementById("invoices-body"),

  exportJson: document.getElementById("export-json"),
  importJson: document.getElementById("import-json"),

  invoiceModal: document.getElementById("invoice-modal"),
  invoicePrint: document.getElementById("invoice-print"),
  sendWhatsapp: document.getElementById("send-whatsapp"),
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

function parseServerDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hasTz = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw);
  const normalized = hasTz ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  const dt = parseServerDateTime(value);
  if (!dt) return "-";
  return dt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function formatTime(value) {
  const dt = parseServerDateTime(value);
  if (!dt) return "-";
  return dt.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function dateKeyIST(value) {
  const dt = parseServerDateTime(value);
  if (!dt) return "";
  return dt.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatDateOnlyIST(value) {
  const dt = parseServerDateTime(value);
  if (!dt) return "-";
  return dt.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    weekday: "long"
  });
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

function findProductBySku(skuValue) {
  const typedSku = String(skuValue || "").trim().toLowerCase();
  if (!typedSku) return null;
  return state.products.find((item) => String(item.sku).trim().toLowerCase() === typedSku) || null;
}

function cleanSearchText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split("|")[0].trim().toLowerCase();
}

function findProductBySkuOrName(value) {
  const q = cleanSearchText(value);
  if (!q) return null;
  const products = productsBySku();
  const exact = products.find((item) => {
    const sku = String(item.sku || "").trim().toLowerCase();
    const name = String(item.name || "").trim().toLowerCase();
    return sku === q || name === q;
  });
  if (exact) return exact;
  return products.find((item) => {
    const sku = String(item.sku || "").trim().toLowerCase();
    const name = String(item.name || "").trim().toLowerCase();
    return sku.startsWith(q) || name.startsWith(q);
  }) || null;
}

function filteredProductsByQuery(value) {
  const q = cleanSearchText(value);
  const products = productsBySku();
  if (!q) return products;
  return products.filter((item) => {
    const sku = String(item.sku || "").trim().toLowerCase();
    const name = String(item.name || "").trim().toLowerCase();
    return sku.startsWith(q) || name.startsWith(q);
  });
}

function productsBySku() {
  return [...state.products].sort((a, b) =>
    String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
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

function setAuth(token, user) {
  state.authToken = token || "";
  state.authUser = user || null;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function showLogin(show) {
  if (el.authCard) el.authCard.classList.toggle("hidden", !show);
  if (el.appMain) el.appMain.classList.toggle("hidden", show);
  if (el.logoutBtn) el.logoutBtn.classList.toggle("hidden", show);
}

function resetInvoiceForm() {
  state.draftLines = [];
  el.invoiceForm.reset();
  el.invoiceQty.value = "1";
  if (el.invoicePrice) el.invoicePrice.value = "";
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

  if (state.authUser && state.authUser.role === "main") {
    const mainOpt = document.createElement("option");
    mainOpt.value = MAIN_ID;
    mainOpt.textContent = "Main Dashboard";
    el.shopSelect.appendChild(mainOpt);
    el.shopSelect.disabled = true;
  } else if (state.authUser && state.authUser.role === "shop" && state.authUser.shopId) {
    const option = document.createElement("option");
    option.value = state.authUser.shopId;
    option.textContent = getShopName(state.authUser.shopId);
    el.shopSelect.appendChild(option);
    el.shopSelect.disabled = true;
  } else {
    el.shopSelect.disabled = false;
  }

  el.shopSelect.value = state.selectedShopId;
  if (el.shopSelect.value !== state.selectedShopId) {
    el.shopSelect.selectedIndex = 0;
    state.selectedShopId = el.shopSelect.value || MAIN_ID;
  }
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
  const items = filteredProductsByQuery(el.invoiceSku ? el.invoiceSku.value : "");
  items.forEach((product) => {
    const option = document.createElement("option");
    option.value = `${product.sku} | ${product.name}`;
    el.skuList.appendChild(option);
  });
  if (!el.restockList) return;
  el.restockList.innerHTML = "";
  const restockItems = filteredProductsByQuery(el.restockQuery ? el.restockQuery.value : "");
  restockItems.forEach((product) => {
    const option = document.createElement("option");
    option.value = `${product.sku} | ${product.name}`;
    el.restockList.appendChild(option);
  });
}

function renderInventory() {
  el.inventoryBody.innerHTML = "";
  const totalStock = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  if (el.inventoryTotal) {
    el.inventoryTotal.textContent = `Total Stocks Available: ${totalStock}`;
  }

  const visibleProducts = filteredProductsByQuery(el.inventorySearch ? el.inventorySearch.value : "");
  visibleProducts.forEach((product, index) => {
    const status = getStatus(Number(product.stock || 0));
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${product.name}</td>
      <td>${product.sku}</td>
      <td>${money(product.price)}</td>
      <td>${product.stock}</td>
      <td><span class="badge ${status.level}">${status.text}</span></td>
      <td>
        <div class="inventory-add-controls">
          <input type="number" min="1" value="1" data-stock-input="${product.id}" />
          <button type="button" class="small-btn" data-add-stock="${product.id}">Add</button>
        </div>
      </td>
      <td><button type="button" class="small-btn" data-remove-product="${product.id}">Remove</button></td>
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
      <td>${line.sku || "-"}</td>
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
  const now = new Date();
  const todayKey = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  let activeGroup = "";

  state.invoices.forEach((invoice) => {
    const key = dateKeyIST(invoice.created_at);
    if (key !== activeGroup) {
      activeGroup = key;
      const label = key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : formatDateOnlyIST(invoice.created_at);
      const groupRow = document.createElement("tr");
      groupRow.className = "invoice-group-row";
      groupRow.innerHTML = `<td colspan="5"><strong>${label}</strong></td>`;
      el.invoicesBody.appendChild(groupRow);
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${invoice.number}</td>
      <td>${formatDateTime(invoice.created_at)}</td>
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
    `Date: ${formatDateTime(invoice.created_at)}`,
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
  state.activeInvoice = invoice;
  el.invoicePrint.textContent = invoiceText(invoice);
  el.invoiceModal.showModal();
}

function normalizeWhatsappNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}

async function onSendWhatsapp() {
  const invoice = state.activeInvoice;
  if (!invoice) {
    alert("Open an invoice first.");
    return;
  }
  const phone = normalizeWhatsappNumber(invoice.customer_phone);
  if (!phone) {
    alert("Customer phone is missing in this invoice.");
    return;
  }
  const text = invoiceText(invoice);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
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
  if (!state.authUser) return;

  if (state.authUser.role === "main") {
    state.selectedShopId = MAIN_ID;
  } else if (state.authUser.role === "shop" && state.authUser.shopId) {
    state.selectedShopId = state.authUser.shopId;
  }

  renderShopSelector();
  renderMode();

  if (state.authUser.role === "main") {
    await loadSummary();
    renderDashboard();
  } else if (state.authUser.role === "shop" && state.authUser.shopId) {
    state.summary = null;
    await loadShopData(state.selectedShopId);
    renderProductOptions();
    renderInventory();
    renderDraftLines();
    renderInvoices();
  }
}

function addDraftLine() {
  const product = findProductBySkuOrName(el.invoiceSku.value);
  const qty = Number(el.invoiceQty.value || 0);
  const priceRaw = String((el.invoicePrice && el.invoicePrice.value) || "").trim();
  const unitPrice = priceRaw === "" ? Number(product && product.price) : Number(priceRaw);

  if (!product || qty <= 0) {
    alert("Enter a valid SKU/Product name and quantity.");
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    alert("Enter a valid price.");
    return;
  }

  if (qty > Number(product.stock || 0)) {
    alert("Not enough stock available.");
    return;
  }

  state.draftLines.push({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    qty,
    price: unitPrice,
    total: unitPrice * qty
  });

  el.invoiceSku.value = "";
  el.invoiceQty.value = "1";
  if (el.invoicePrice) el.invoicePrice.value = "";
  el.invoiceSku.focus();
  renderDraftLines();
  renderProductOptions();
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
      lines: state.draftLines.map((line) => ({ productId: line.productId, qty: line.qty, price: line.price })),
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
      state.activeInvoice = result.invoice;
      el.invoicePrint.textContent = invoiceText(result.invoice);
      el.invoiceModal.showModal();
    }
  } catch (error) {
    alert(error.message);
  }
}

async function onReceiveStock(productId, qty) {
  if (state.selectedShopId === MAIN_ID) return;
  if (!productId || qty <= 0) {
    alert("Enter valid received stock quantity.");
    return;
  }

  try {
    await api(`/shops/${state.selectedShopId}/stock/add`, {
      method: "POST",
      body: JSON.stringify({
        productId,
        qty
      })
    });
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

async function onQuickRestock() {
  const product = findProductBySkuOrName(el.restockQuery ? el.restockQuery.value : "");
  const qty = Number((el.restockQty && el.restockQty.value) || 0);
  if (!product || qty <= 0) {
    alert("Enter valid SKU/Product name and quantity.");
    return;
  }
  await onReceiveStock(product.id, qty);
  if (el.restockQuery) el.restockQuery.value = "";
  if (el.restockQty) el.restockQty.value = "1";
  renderProductOptions();
}

async function onRemoveProduct(productId) {
  if (state.selectedShopId === MAIN_ID) return;
  if (!productId) return;
  if (!confirm("Remove this product from inventory?")) return;

  try {
    await api(`/shops/${state.selectedShopId}/products/${productId}`, {
      method: "DELETE"
    });
    await refresh();
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
    lines.push(`Time: ${formatTime(invoice.created_at)}`);
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

async function attemptRestoreSession() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return false;
  state.authToken = token;
  try {
    const result = await api("/auth/me");
    state.authUser = result.user || null;
    return Boolean(state.authUser);
  } catch {
    setAuth("", null);
    return false;
  }
}

async function onLogin(event) {
  event.preventDefault();
  const uid = (el.loginUid.value || "").trim();
  const password = el.loginPassword.value || "";
  if (!uid || !password) {
    alert("User ID and password are required.");
    return;
  }

  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ uid, password })
    });
    setAuth(result.token, result.user);
    el.loginPassword.value = "";
    showLogin(false);
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

function onLogout() {
  setAuth("", null);
  state.selectedShopId = "shop1";
  state.products = [];
  state.invoices = [];
  state.summary = null;
  state.activeInvoice = null;
  resetInvoiceForm();
  showLogin(true);
}

el.productForm.addEventListener("submit", onAddProduct);
el.addLineItem.addEventListener("click", addDraftLine);
el.invoiceSku.addEventListener("input", () => {
  renderProductOptions();
  const product = findProductBySkuOrName(el.invoiceSku.value);
  if (el.invoicePrice && product) {
    el.invoicePrice.value = Number(product.price).toFixed(2);
  }
});
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
if (el.sendWhatsapp) el.sendWhatsapp.addEventListener("click", onSendWhatsapp);
el.printInvoice.addEventListener("click", () => window.print());
if (el.inventorySearch) {
  el.inventorySearch.addEventListener("input", () => renderInventory());
}
if (el.restockQuery) {
  el.restockQuery.addEventListener("input", () => renderProductOptions());
  el.restockQuery.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await onQuickRestock();
    }
  });
}
if (el.restockAddBtn) {
  el.restockAddBtn.addEventListener("click", onQuickRestock);
}

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

el.inventoryBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const removeProductId = target.getAttribute("data-remove-product");
  if (removeProductId) {
    await onRemoveProduct(removeProductId);
    return;
  }

  const productId = target.getAttribute("data-add-stock");
  if (!productId) return;

  const input = el.inventoryBody.querySelector(`[data-stock-input="${productId}"]`);
  const qty = input instanceof HTMLInputElement ? Number(input.value || 0) : 0;
  await onReceiveStock(productId, qty);
});

el.loginForm.addEventListener("submit", onLogin);
el.logoutBtn.addEventListener("click", onLogout);

bootstrapUi();
showLogin(true);

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

(async () => {
  const ok = await attemptRestoreSession();
  if (ok) {
    showLogin(false);
    await refresh();
  } else {
    showLogin(true);
  }
})().catch((error) => {
  showLogin(true);
  alert(`Server connection error: ${error.message}`);
});
