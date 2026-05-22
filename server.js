const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: './public/uploads',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '_' + file.originalname);
    }
});

const upload = multer({ storage });

const app = express();
app.use(express.json());

// ================= BASE DE DATOS =================
const db = new sqlite3.Database('./tecnosystem.db');

db.serialize(() => {

    // USUARIOS
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE,
            password TEXT,
            rol TEXT
        )
    `);

    db.run(`
        INSERT OR IGNORE INTO usuarios (usuario, password, rol)
        VALUES 
        ('recepcion', '1234', 'RECEPCION'),
        ('tecnico', '1234', 'TECNICO')
    `);

    // CLIENTES
    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            nit TEXT,
            telefono TEXT,
            direccion TEXT
        )
    `);

    // EQUIPOS
    db.run(`
        CREATE TABLE IF NOT EXISTS equipos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            marca TEXT,
            modelo TEXT,
            serial TEXT UNIQUE,
            tipo TEXT
        )
    `);

    // ORDENES
    db.run(`
        CREATE TABLE IF NOT EXISTS ordenes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            equipo_id INTEGER,
            fecha_ingreso TEXT,
            estado TEXT,
            tipo_servicio TEXT,
            descripcion TEXT,
            diagnostico TEXT,
            observaciones TEXT
        )
    `);

    // INICIAR EN 1000
    db.run(`UPDATE sqlite_sequence SET seq = 999 WHERE name = 'ordenes'`);
    db.run(`ALTER TABLE ordenes ADD COLUMN foto TEXT`, (err) => {
    if (err) {
        console.log("Columna foto ya existe o error:", err.message);
    } else {
        console.log("Columna foto agregada");
    }
});
});


// ================= CLIENTES =================
app.post('/clientes', (req, res) => {
    const { nombre, nit, telefono, direccion } = req.body;

    db.run(
        `INSERT INTO clientes (nombre, nit, telefono, direccion) VALUES (?, ?, ?, ?)`,
        [nombre, nit, telefono, direccion],
        function (err) {
            if (err) return res.send(err);
            res.send({ id: this.lastID });
        }
    );
});


// ================= EQUIPOS =================
app.post('/equipos', (req, res) => {
    const { marca, modelo, serial, tipo } = req.body;

    db.run(
        `INSERT INTO equipos (marca, modelo, serial, tipo) VALUES (?, ?, ?, ?)`,
        [marca, modelo, serial, tipo],
        function (err) {
            if (err) return res.send({ error: 'Serial ya existe' });
            res.send({ id: this.lastID });
        }
    );
});


// ================= ORDENES =================
app.post('/ordenes', (req, res) => {
    const { cliente_id, equipo_id, descripcion, tipo_servicio } = req.body;

    db.run(
        `INSERT INTO ordenes 
        (cliente_id, equipo_id, fecha_ingreso, estado, tipo_servicio, descripcion) 
        VALUES (?, ?, datetime('now'), 'EN COLA', ?, ?)`,
        [cliente_id, equipo_id, tipo_servicio, descripcion],
        function (err) {
            if (err) return res.send(err);
            res.send({ orden_id: this.lastID });
        }
    );
});


// ================= LISTAR =================
app.get('/ordenes', (req, res) => {
    db.all(`
        SELECT 
            ordenes.id,
            clientes.nombre,
            equipos.marca,
            equipos.modelo,
            equipos.serial,
            ordenes.estado,
            ordenes.descripcion
        FROM ordenes
        JOIN clientes ON ordenes.cliente_id = clientes.id
        JOIN equipos ON ordenes.equipo_id = equipos.id
        ORDER BY ordenes.id DESC
    `, [], (err, rows) => {
        if (err) {
            console.log(err); // 👈 IMPORTANTE
            return res.send(err);
        }
        res.send(rows);
    });
});


// ================= CAMBIAR ESTADO =================
app.post('/ordenes/estado', (req, res) => {
    const { id, estado } = req.body;

    db.run(
        `UPDATE ordenes SET estado = ? WHERE id = ?`,
        [estado, id],
        function (err) {
            if (err) return res.send(err);
            res.send({ ok: true });
        }
    );
});
app.get('/historial/:serial', (req, res) => {

    const serial = req.params.serial;

    db.all(`
        SELECT 
            ordenes.id,
            clientes.nombre,
            equipos.serial,
            ordenes.estado,
            ordenes.fecha_ingreso,
            ordenes.diagnostico,
            ordenes.observaciones,
            ordenes.foto

        FROM ordenes

        JOIN clientes 
        ON ordenes.cliente_id = clientes.id

        JOIN equipos 
        ON ordenes.equipo_id = equipos.id

        WHERE equipos.serial = ?

        ORDER BY ordenes.id DESC
    `,
    [serial],
    (err, rows) => {

        if (err) {

            console.log(err);

            return res.json([]);

        }

        res.json(rows);

    });

});

app.post('/ordenes/finalizar', upload.array('foto', 10), (req, res) => {

    const { id, estado, diagnostico, observaciones } = req.body;

    let fotos = null;

    if (req.files && req.files.length > 0) {
        fotos = req.files.map(f => '/uploads/' + f.filename).join('|');
    }

    db.run(`
        UPDATE ordenes 
        SET estado = ?, 
            diagnostico = ?, 
            observaciones = ?, 
            foto = ?
        WHERE id = ?
    `,
    [estado, diagnostico, observaciones, fotos, id],
    function(err) {

        if (err) {
            console.log(err);
            return res.status(500).json({
                error: err.message
            });
        }

        res.json({
            ok: true
        });

    });

});
// 🔐 LOGIN
app.post('/login', (req, res) => {

    const { usuario, password } = req.body;

    db.get(
        `SELECT * FROM usuarios WHERE usuario = ? AND password = ?`,
        [usuario, password],
        (err, row) => {

            if (err) {
                return res.send(err);
            }

            if (!row) {
                return res.send({ error: 'Usuario o contraseña incorrectos' });
            }

            res.send({
                id: row.id,
                usuario: row.usuario,
                rol: row.rol
            });
        }
    );
});


// ================= PDF =================
app.get('/ordenes/pdf/:id', (req, res) => {

    const id = req.params.id;

    db.get(`
        SELECT 
            ordenes.id,
            clientes.nombre,
            clientes.telefono,
            clientes.direccion,
            equipos.marca,
            equipos.modelo,
            equipos.serial,
            ordenes.descripcion,
            ordenes.estado,
            ordenes.fecha_ingreso
        FROM ordenes
        JOIN clientes ON ordenes.cliente_id = clientes.id
        JOIN equipos ON ordenes.equipo_id = equipos.id
        WHERE ordenes.id = ?
    `, [id], (err, o) => {

        if (err || !o) return res.send('Error');

        const doc = new PDFDocument({ size: [612, 795], margin: 0 });
        res.setHeader('Content-Type', 'application/pdf');
        doc.pipe(res);

        let inicio = 135;

        // ===== ENCABEZADO IMAGEN =====
        try {
            doc.image(__dirname + '/public/img/encabezado.png', 13, 1, {
                width: 587,
                height: 150
            });
        } catch (e) {}

        // ===== TEXTO ENCABEZADO =====
        doc.fontSize(10);

        doc.fillColor('black')
        .text('ORDEN DE SERVICIO: ', 420, 155, { continued: true });

        doc.fillColor('red').text(o.id);

        doc.fillColor('black');

        doc.text(`Fecha: ${o.fecha_ingreso}`, 280, 155);
        doc.text(`Cliente: ${o.nombre}`, 15, 155);
        doc.text(`Tel: ${o.telefono}`, 200, 155);
        doc.text(`Equipo: ${o.marca} ${o.modelo}`, 15, 175);
        doc.text(`Serial: ${o.serial}`, 280, 175);

        doc.rect(13, 150, 586, 38).stroke();

        // ===== LINEAS =====
        doc.moveTo(43, 200).lineTo(43, 610).stroke();
        doc.moveTo(420, 200).lineTo(420, 610).stroke();

        // ===== CABECERA TABLA =====
        doc.rect(13, 190, 586, 20).fill('#06142E');

        doc.fillColor('white')
        .fontSize(10)
        .text('ITEM', 15, 195)
        .text('DESCRIPCIÓN', 160, 195)
        .text('ESTADO', 490, 195);

        // ===== FILA =====
        doc.fillColor('black');
        doc.rect(13, 210, 586, 400).stroke();

        doc.text('1', 23, 220);
        doc.text(o.descripcion, 100, 220, { width: 300 });
        doc.text(o.estado, 450, 220);

        // ===== CONDICIONES =====
        doc.fontSize(12)
        .text('CONDICIONES:', 30, 615)
        .text('- Equipo entregado para revisión', 30, 630)
        .text('- Garantía según diagnóstico', 30, 645)
        .text('- Despues de 30 dias no se responde por equipos', 30, 660);

        // ===== MENSAJE =====
        doc.fillColor('black')
        .fontSize(18)
        .text('Gracias por confiar en nosotros', 180, 710);

        // ===== FIRMA =====
        doc.moveTo(590, 660).lineTo(430, 660).stroke();

        doc.fontSize(10)
        .text('Firma del Cliente', 470, 670);

        // ===== PIE IMAGEN =====
        try {
            doc.image(__dirname + '/public/img/pie.png', 0, 740, {
                width: 612,
                height: 50
            });
        } catch (e) {}

        doc.end();
    });
});


// ================= QR =================
app.get('/ordenes/qr/:id', async (req, res) => {
    const id = req.params.id;

    const url = `http://192.168.1.60:3000/ordenes/pdf/${id}`;
    const qr = await QRCode.toDataURL(url);

    res.send(`<img src="${qr}">`);
});
// ================= TICKET POS =================
app.get('/ordenes/ticket/:id', async (req, res) => {

    const id = req.params.id;

    db.get(`
        SELECT 
            ordenes.id,
            ordenes.descripcion,
            ordenes.fecha_ingreso,

            clientes.nombre,
            clientes.telefono,

            equipos.marca,
            equipos.modelo,
            equipos.serial

        FROM ordenes

        JOIN clientes 
        ON ordenes.cliente_id = clientes.id

        JOIN equipos 
        ON ordenes.equipo_id = equipos.id

        WHERE ordenes.id = ?
    `,
    [id],
    async (err, o) => {

        if (err || !o) {
            return res.send('Error');
        }

        const doc = new PDFDocument({
            size: [226, 600],
            margin: 10
        });

        res.setHeader('Content-Type', 'application/pdf');

        doc.pipe(res);

        // ===== LOGO =====
        try {
            doc.image('./public/img/logo.png', 60, 10, {
                width: 100
            });
        } catch(e) {}

        doc.y = 90;

        // ===== TITULO =====
        doc.fontSize(14)
        .text('TICKET DE RECEPCIÓN', {
            align: 'center'
        });

        doc.moveDown();

        // ===== DATOS =====
        doc.fontSize(10);

        doc.text(`Orden: ${o.id}`);
        doc.text(`Fecha: ${o.fecha_ingreso}`);

        doc.moveDown(0.5);

        doc.text(`Cliente: ${o.nombre}`);
        doc.text(`Tel: ${o.telefono}`);

        doc.moveDown(0.5);

        doc.text(`Equipo: ${o.marca} ${o.modelo}`);
        doc.text(`Serial: ${o.serial}`);

        doc.moveDown(2);

        doc.text('PROBLEMA REPORTADO:', {
            underline: true
        });

        doc.text(o.descripcion);

        doc.moveDown();

        // ===== QR =====
        const qr = await QRCode.toDataURL(
            `http://192.168.1.60:3000/ordenes/pdf/${o.id}`
        );

        const base64 = qr.replace(
            /^data:image\/png;base64,/,
            ''
        );

        const qrBuffer = Buffer.from(base64, 'base64');

        doc.image(qrBuffer, 60, doc.y + 200, {
    width: 90
});

doc.y += 30;

        doc.moveDown(6);

        // ===== CONDICIONES =====
        doc.fontSize(8);

        doc.text(
            'Después de 30 días no nos hacemos responsables por equipos no reclamados.',
            {
                align: 'justify'
            }
        );

        doc.moveDown(2);

        // ===== FIRMA =====
        doc.moveDown(2);

doc.text('________________________', {
    align: 'center'
});

doc.text('Firma Cliente', {
    align: 'center'
});

        doc.moveDown();

        doc.text('Gracias por confiar en TECNOSYSTEM', {
            align: 'center'
        });

        doc.end();

    });

});

// ================= FRONTEND =================
app.use(express.static('public'));

// ================= DASHBOARD =================
app.get('/dashboard-data', (req, res) => {

    db.all(`
        SELECT estado, COUNT(*) as total
        FROM ordenes
        GROUP BY estado
    `, [], (err, estados) => {

        if (err) {
            return res.send(err);
        }

        db.get(`
            SELECT COUNT(*) as total
            FROM ordenes
        `, [], (err2, total) => {

            if (err2) {
                return res.send(err2);
            }

            db.all(`
                SELECT 
                    ordenes.id,
                    clientes.nombre,
                    equipos.marca,
                    equipos.modelo,
                    ordenes.estado
                FROM ordenes
                JOIN clientes 
                ON ordenes.cliente_id = clientes.id
                JOIN equipos 
                ON ordenes.equipo_id = equipos.id
                ORDER BY ordenes.id DESC
                LIMIT 5
            `, [], (err3, ultimas) => {

                if (err3) {
                    return res.send(err3);
                }

                res.send({
                    total: total.total,
                    estados,
                    ultimas
                });

            });

        });

    });

});

// ================= SERVIDOR =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('Servidor iniciado');
});