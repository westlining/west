import argparse
import json
import os
import socket
import sqlite3
import ssl
import uuid
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "billing_stock.db"
CERT_PATH = BASE_DIR / "cert.pem"
KEY_PATH = BASE_DIR / "key.pem"
CA_CERT_PATH = BASE_DIR / "rootCA.pem"
CA_KEY_PATH = BASE_DIR / "rootCA-key.pem"
CA_CER_PATH = BASE_DIR / "rootCA.cer"
SHOPS = [
    {"id": "shop1", "name": "Shop 1"},
    {"id": "shop2", "name": "Shop 2"},
    {"id": "shop3", "name": "Shop 3"},
]
SHOP_IDS = {shop["id"] for shop in SHOPS}


def ensure_https_certificates(hostnames=None, cert_path=CERT_PATH, key_path=KEY_PATH):
    if hostnames is None:
        hostnames = ["localhost", "127.0.0.1"]

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    def _san_targets(cert_obj):
        san_ext = cert_obj.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        out = set()
        for item in san_ext:
            if isinstance(item, x509.DNSName):
                out.add(str(item.value))
            elif isinstance(item, x509.IPAddress):
                out.add(str(item.value))
        return out

    normalized_targets = set(str(item) for item in hostnames)
    regenerate_server = True
    if cert_path.exists() and key_path.exists():
        try:
            cert_obj = x509.load_pem_x509_certificate(cert_path.read_bytes())
            regenerate_server = not normalized_targets.issubset(_san_targets(cert_obj))
        except Exception:
            regenerate_server = True

    # Create root CA once
    if not (CA_CERT_PATH.exists() and CA_KEY_PATH.exists()):
        ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        ca_subject = x509.Name(
            [
                x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "West Lining Point"),
                x509.NameAttribute(NameOID.COMMON_NAME, "West Lining Point Local Root CA"),
            ]
        )
        ca_cert = (
            x509.CertificateBuilder()
            .subject_name(ca_subject)
            .issuer_name(ca_subject)
            .public_key(ca_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.utcnow() - timedelta(days=1))
            .not_valid_after(datetime.utcnow() + timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .sign(ca_key, hashes.SHA256())
        )
        CA_KEY_PATH.write_bytes(
            ca_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        CA_CERT_PATH.write_bytes(ca_cert.public_bytes(serialization.Encoding.PEM))
        CA_CER_PATH.write_bytes(ca_cert.public_bytes(serialization.Encoding.PEM))

    if not regenerate_server:
        return cert_path, key_path

    ca_key = serialization.load_pem_private_key(CA_KEY_PATH.read_bytes(), password=None)
    ca_cert = x509.load_pem_x509_certificate(CA_CERT_PATH.read_bytes())

    server_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    server_subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "West Lining Point"),
            x509.NameAttribute(NameOID.COMMON_NAME, "West Lining Point Server"),
        ]
    )
    san_entries = []
    for host in hostnames:
        try:
            san_entries.append(x509.IPAddress(ip_address(host)))
        except ValueError:
            san_entries.append(x509.DNSName(host))

    server_cert = (
        x509.CertificateBuilder()
        .subject_name(server_subject)
        .issuer_name(ca_cert.subject)
        .public_key(server_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow() - timedelta(days=1))
        .not_valid_after(datetime.utcnow() + timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    key_path.write_bytes(
        server_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    cert_path.write_bytes(server_cert.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            shop_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sku TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(shop_id, sku)
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            shop_id TEXT NOT NULL,
            number TEXT NOT NULL,
            created_at TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT,
            subtotal REAL NOT NULL,
            discount REAL NOT NULL,
            tax_rate REAL NOT NULL,
            tax_amount REAL NOT NULL,
            total REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS invoice_lines (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            name TEXT NOT NULL,
            qty INTEGER NOT NULL,
            price REAL NOT NULL,
            total REAL NOT NULL,
            FOREIGN KEY(invoice_id) REFERENCES invoices(id)
        );

        CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_shop ON invoices(shop_id);
        CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
        """
    )
    conn.commit()
    conn.close()


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def serialize_row(row):
    return dict(row) if row else None


def query_products(conn, shop_id):
    rows = conn.execute(
        "SELECT id, shop_id, name, sku, price, stock, created_at FROM products WHERE shop_id = ? ORDER BY sku ASC",
        (shop_id,),
    ).fetchall()
    return [serialize_row(row) for row in rows]


def query_invoices(conn, shop_id, start_iso=None, end_iso=None):
    sql = """
        SELECT id, shop_id, number, created_at, customer_name, customer_phone,
               subtotal, discount, tax_rate, tax_amount, total
        FROM invoices
        WHERE shop_id = ?
    """
    params = [shop_id]
    if start_iso is not None and end_iso is not None:
        sql += " AND created_at >= ? AND created_at < ?"
        params.extend([start_iso, end_iso])
    sql += " ORDER BY created_at DESC"

    invoices = []
    for inv in conn.execute(sql, params).fetchall():
        invoice = serialize_row(inv)
        line_rows = conn.execute(
            """
            SELECT id, invoice_id, product_id, name, qty, price, total
            FROM invoice_lines
            WHERE invoice_id = ?
            ORDER BY name ASC
            """,
            (invoice["id"],),
        ).fetchall()
        invoice["lines"] = [serialize_row(line) for line in line_rows]
        invoices.append(invoice)
    return invoices


def today_bounds():
    now = datetime.now()
    start = datetime(now.year, now.month, now.day)
    end = start + timedelta(days=1)
    return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")


def make_invoice_number(conn, shop_id):
    count = conn.execute("SELECT COUNT(*) AS n FROM invoices WHERE shop_id = ?", (shop_id,)).fetchone()["n"]
    shop_name = next((s["name"] for s in SHOPS if s["id"] == shop_id), shop_id)
    prefix = shop_name.replace(" ", "").upper()
    return f"{prefix}-{count + 1:04d}"


class AppHandler(BaseHTTPRequestHandler):
    def _send_json(self, code, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_file(self, file_path):
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Not Found")
            return

        mime = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
        }.get(file_path.suffix.lower(), "application/octet-stream")

        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _read_json(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        return json.loads(raw.decode("utf-8"))

    def _parse_shop_id(self, parts):
        # Expected path format: /api/shops/{shop_id}/...
        if len(parts) < 5:
            return None
        if parts[1] != "api" or parts[2] != "shops":
            return None
        shop_id = parts[3]
        return shop_id if shop_id in SHOP_IDS else None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self.handle_api_get(path)
            return

        safe_path = path.lstrip("/") or "index.html"
        file_path = (BASE_DIR / safe_path).resolve()
        if BASE_DIR not in file_path.parents and file_path != BASE_DIR:
            self.send_error(403, "Forbidden")
            return

        if file_path == BASE_DIR:
            file_path = BASE_DIR / "index.html"
        self._send_file(file_path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self.send_error(404, "Not Found")
            return
        self.handle_api_post(path)

    def handle_api_get(self, path):
        if path == "/api/health":
            self._send_json(200, {"ok": True, "time": now_iso()})
            return

        if path == "/api/shops/summary":
            conn = db_conn()
            shops = []
            totals = {"sales": 0.0, "invoices": 0, "itemsLeft": 0}
            for shop in SHOPS:
                sales = conn.execute(
                    "SELECT COALESCE(SUM(total), 0) AS total_sales, COUNT(*) AS total_invoices FROM invoices WHERE shop_id = ?",
                    (shop["id"],),
                ).fetchone()
                stock = conn.execute(
                    "SELECT COALESCE(SUM(stock), 0) AS items_left FROM products WHERE shop_id = ?",
                    (shop["id"],),
                ).fetchone()
                row = {
                    "id": shop["id"],
                    "name": shop["name"],
                    "sales": float(sales["total_sales"] or 0),
                    "invoices": int(sales["total_invoices"] or 0),
                    "itemsLeft": int(stock["items_left"] or 0),
                }
                totals["sales"] += row["sales"]
                totals["invoices"] += row["invoices"]
                totals["itemsLeft"] += row["itemsLeft"]
                shops.append(row)
            conn.close()
            self._send_json(200, {"shops": shops, "totals": totals})
            return

        parts = path.split("/")
        shop_id = self._parse_shop_id(parts)
        if not shop_id:
            self._send_json(404, {"error": "Invalid shop."})
            return

        conn = db_conn()
        if path.endswith("/products"):
            self._send_json(200, {"items": query_products(conn, shop_id)})
            conn.close()
            return

        if path.endswith("/stock"):
            self._send_json(200, {"items": query_products(conn, shop_id)})
            conn.close()
            return

        if path.endswith("/invoices"):
            self._send_json(200, {"items": query_invoices(conn, shop_id)})
            conn.close()
            return

        if path.endswith("/sales/today"):
            start_iso, end_iso = today_bounds()
            invoices = query_invoices(conn, shop_id, start_iso, end_iso)
            total_sales = sum(float(inv["total"]) for inv in invoices)
            items_sold = sum(int(line["qty"]) for inv in invoices for line in inv["lines"])
            payload = {
                "date": datetime.now().date().isoformat(),
                "invoiceCount": len(invoices),
                "itemsSold": items_sold,
                "totalSales": total_sales,
                "invoices": invoices,
            }
            self._send_json(200, payload)
            conn.close()
            return

        conn.close()
        self._send_json(404, {"error": "Unknown endpoint."})

    def handle_api_post(self, path):
        parts = path.split("/")
        shop_id = self._parse_shop_id(parts)
        if not shop_id:
            self._send_json(404, {"error": "Invalid shop."})
            return

        try:
            payload = self._read_json()
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload."})
            return

        if path.endswith("/products"):
            self.create_product(shop_id, payload)
            return

        if path.endswith("/stock/add"):
            self.add_stock(shop_id, payload)
            return

        if path.endswith("/invoices"):
            self.create_invoice(shop_id, payload)
            return

        self._send_json(404, {"error": "Unknown endpoint."})

    def create_product(self, shop_id, payload):
        name = str(payload.get("name", "")).strip()
        sku = str(payload.get("sku", "")).strip()
        price = float(payload.get("price", 0))
        stock = int(payload.get("stock", 0))

        if not name or not sku:
            self._send_json(400, {"error": "Name and SKU are required."})
            return
        if price < 0 or stock < 0:
            self._send_json(400, {"error": "Price and stock must be >= 0."})
            return

        conn = db_conn()
        try:
            conn.execute(
                """
                INSERT INTO products(id, shop_id, name, sku, price, stock, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), shop_id, name, sku, price, stock, now_iso()),
            )
            conn.commit()
            self._send_json(201, {"ok": True})
        except sqlite3.IntegrityError:
            self._send_json(409, {"error": "SKU already exists in this shop."})
        finally:
            conn.close()

    def add_stock(self, shop_id, payload):
        product_id = str(payload.get("productId", "")).strip()
        qty = int(payload.get("qty", 0))

        if not product_id or qty <= 0:
            self._send_json(400, {"error": "Valid product and quantity are required."})
            return

        conn = db_conn()
        try:
            product = conn.execute(
                "SELECT id FROM products WHERE id = ? AND shop_id = ?",
                (product_id, shop_id),
            ).fetchone()
            if not product:
                self._send_json(404, {"error": "Product not found in this shop."})
                return

            conn.execute(
                "UPDATE products SET stock = stock + ? WHERE id = ? AND shop_id = ?",
                (qty, product_id, shop_id),
            )
            conn.commit()
            self._send_json(200, {"ok": True})
        finally:
            conn.close()

    def create_invoice(self, shop_id, payload):
        customer_name = str(payload.get("customerName", "")).strip()
        customer_phone = str(payload.get("customerPhone", "")).strip()
        raw_lines = payload.get("lines", [])
        discount = float(payload.get("discount", 0) or 0)
        tax_rate = float(payload.get("taxRate", 0) or 0)

        if not customer_name:
            self._send_json(400, {"error": "Customer name is required."})
            return
        if not isinstance(raw_lines, list) or not raw_lines:
            self._send_json(400, {"error": "At least one line item is required."})
            return

        usage = {}
        for line in raw_lines:
            product_id = str(line.get("productId", "")).strip()
            qty = int(line.get("qty", 0))
            if not product_id or qty <= 0:
                self._send_json(400, {"error": "Invalid line items."})
                return
            usage[product_id] = usage.get(product_id, 0) + qty

        conn = db_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")

            placeholders = ",".join(["?"] * len(usage))
            rows = conn.execute(
                f"SELECT id, name, sku, price, stock FROM products WHERE shop_id = ? AND id IN ({placeholders})",
                [shop_id, *usage.keys()],
            ).fetchall()
            products = {row["id"]: row for row in rows}

            if len(products) != len(usage):
                raise ValueError("One or more products not found in this shop.")

            for product_id, qty in usage.items():
                if qty > int(products[product_id]["stock"]):
                    raise ValueError(f"Not enough stock for {products[product_id]['name']}.")

            line_items = []
            subtotal = 0.0
            for product_id, qty in usage.items():
                product = products[product_id]
                price = float(product["price"])
                total = price * qty
                subtotal += total
                line_items.append(
                    {
                        "id": str(uuid.uuid4()),
                        "productId": product_id,
                        "name": product["name"],
                        "qty": qty,
                        "price": price,
                        "total": total,
                    }
                )

            after_discount = max(subtotal - discount, 0)
            tax_amount = (after_discount * tax_rate) / 100.0
            grand_total = after_discount + tax_amount

            for product_id, qty in usage.items():
                conn.execute(
                    "UPDATE products SET stock = stock - ? WHERE id = ? AND shop_id = ?",
                    (qty, product_id, shop_id),
                )

            invoice_id = str(uuid.uuid4())
            number = make_invoice_number(conn, shop_id)
            created_at = now_iso()
            conn.execute(
                """
                INSERT INTO invoices(
                    id, shop_id, number, created_at, customer_name, customer_phone,
                    subtotal, discount, tax_rate, tax_amount, total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    invoice_id,
                    shop_id,
                    number,
                    created_at,
                    customer_name,
                    customer_phone,
                    subtotal,
                    discount,
                    tax_rate,
                    tax_amount,
                    grand_total,
                ),
            )

            for line in line_items:
                conn.execute(
                    """
                    INSERT INTO invoice_lines(id, invoice_id, product_id, name, qty, price, total)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        line["id"],
                        invoice_id,
                        line["productId"],
                        line["name"],
                        line["qty"],
                        line["price"],
                        line["total"],
                    ),
                )

            conn.commit()
            self._send_json(
                201,
                {
                    "invoice": {
                        "id": invoice_id,
                        "shopId": shop_id,
                        "shopName": next((s["name"] for s in SHOPS if s["id"] == shop_id), shop_id),
                        "number": number,
                        "created_at": created_at,
                        "customer_name": customer_name,
                        "customer_phone": customer_phone,
                        "lines": line_items,
                        "subtotal": subtotal,
                        "discount": discount,
                        "tax_rate": tax_rate,
                        "tax_amount": tax_amount,
                        "total": grand_total,
                    }
                },
            )
        except ValueError as err:
            conn.rollback()
            self._send_json(400, {"error": str(err)})
        except Exception:
            conn.rollback()
            self._send_json(500, {"error": "Could not create invoice."})
        finally:
            conn.close()


def main():
    parser = argparse.ArgumentParser(description="Billing + Stock central server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
    parser.add_argument("--https", action="store_true")
    parser.add_argument("--cert-file", default=str(CERT_PATH))
    parser.add_argument("--key-file", default=str(KEY_PATH))
    args = parser.parse_args()

    init_db()
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)

    scheme = "http"
    if args.https:
        cert_path = Path(args.cert_file)
        key_path = Path(args.key_file)
        san_hosts = {"localhost", "127.0.0.1"}
        if args.host not in {"0.0.0.0", "::"}:
            san_hosts.add(args.host)
        else:
            try:
                local_infos = socket.getaddrinfo(socket.gethostname(), None, family=socket.AF_INET)
                for info in local_infos:
                    san_hosts.add(info[4][0])
            except Exception:
                pass
        ensure_https_certificates(hostnames=sorted(san_hosts), cert_path=cert_path, key_path=key_path)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = "https"

    print(f"Server running on {scheme}://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
