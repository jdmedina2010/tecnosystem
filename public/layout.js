function cargarLayout(contenidoHTML) {

    let user = null;

    try {
        user = JSON.parse(localStorage.getItem('usuario'));
    } catch (e) {}

    // 🔴 SI NO HAY USUARIO
    if (!user) {
        window.location = '/login.html';
        return;
    }

    // 🔍 DETECTAR PÁGINA ACTUAL
    let ruta = window.location.pathname;

    function activo(url) {
        return ruta === url ? 'background:#0d6efd;' : '';
    }

    document.body.innerHTML = `
    
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">

    <style>
    body { margin:0; background:#f4f6f9; }

    .sidebar {
        width:250px;
        height:100vh;
        background:#0b1f3a;
        color:white;
        position:fixed;
        padding:20px;
    }

    .sidebar a {
        display:block;
        color:white;
        text-decoration:none;
        padding:10px;
        margin:5px 0;
        border-radius:8px;
    }

    .sidebar a:hover { background:#0d6efd; }

    .main {
        margin-left:260px;
        padding:20px;
    }

    .topbar {
        background:white;
        padding:10px 20px;
        border-radius:10px;
        margin-bottom:20px;
    }
    </style>

    <!-- 🔷 SIDEBAR -->
    <div class="sidebar">

        <div style="text-align:center; margin-bottom:20px;">
            <img src="/img/logo.png" style="width:120px;">
            <div><small>${user.rol}</small></div>
        </div>

        <a href="/dashboard.html" style="${activo('/dashboard.html')}">🏠 Dashboard</a>

        ${user.rol === 'RECEPCION' ? `
        <a href="/" style="${activo('/')}">➕ Nueva Orden</a>
        ` : ''}

        <a href="/ordenes.html" style="${activo('/ordenes.html')}">📋 Órdenes</a>

        ${user.rol === 'TECNICO' ? `
        <a href="/tecnico.html" style="${activo('/tecnico.html')}">🛠 Técnico</a>
        ` : ''}

        <a href="/historial.html" style="${activo('/historial.html')}">🔍 Historial</a>
    </div>

    <!-- 🔷 CONTENIDO -->
    <div class="main">

        <div class="topbar d-flex justify-content-between align-items-center">

            <div class="d-flex align-items-center">
                <img src="/img/logo.png" style="width:40px; margin-right:10px;">
                <h5 class="m-0">Tecnosystem</h5>
            </div>

            <div>
                👤 ${user.usuario} (${user.rol})
                <button onclick="logout()" class="btn btn-sm btn-danger ms-2">
                    Salir
                </button>
            </div>
        </div>

        ${contenidoHTML}

    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    `;
}

// 🔴 LOGOUT
function logout() {
    localStorage.removeItem('usuario');
    window.location = '/login.html';
}