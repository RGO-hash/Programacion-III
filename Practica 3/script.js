/* ----------------------------------------------------------
   script.js
   Menú dinámico: carga desde menu.json, administración en UI,
   persistencia local (localStorage), y exportación a archivo.
   ---------------------------------------------------------- */

/* -------------------------
   1) Variables globales
   ------------------------- */
// 'menuData' contendrá el array de objetos del menú (estructura JS)
let menuData = []; // se llena en cargarMenu()

// SELECTORES del DOM usados por las funciones
const menuContainer = document.getElementById("menu");
const menuForm = document.getElementById("menuForm");
const nombreInput = document.getElementById("nombre");
const enlaceInput = document.getElementById("enlace");
const iconoInput = document.getElementById("icono");
const parentIdInput = document.getElementById("parentId");
const editingIdInput = document.getElementById("editingId");
const messageBox = document.getElementById("message");
const jsonView = document.getElementById("jsonView");

const exportBtn = document.getElementById("exportBtn");
const resetBtn = document.getElementById("resetBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const menuToggleBtn = document.getElementById("menuToggle");

/* -------------------------
   2) Cargar datos iniciales
   - Primero comprobamos si existe copia en localStorage (lo que indica que el usuario
     ya hizo cambios).
   - Si no existe, hacemos fetch de menu.json (archivo local).
   IMPORTANTE: fetch de archivos locales (file://) puede fallar por CORS;
   ejecutar desde servidor local (ej: python -m http.server) si ves errores.
   ------------------------- */
async function cargarMenu() {
  // 2.1 Intentar cargar desde localStorage (persistencia del lado cliente)
  const local = localStorage.getItem("menuData");
  if (local) {
    try {
      menuData = JSON.parse(local);
      renderMenu();   // renderizamos lo cargado desde localStorage
      updateJsonView();
      return;
    } catch (err) {
      console.warn("Error parseando localStorage, se cargará menu.json:", err);
    }
  }

  // 2.2 Si no hay localStorage válido, cargamos menu.json con fetch
  try {
    const res = await fetch("menu.json", { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar menu.json: " + res.status);
    const data = await res.json();
    // El JSON tiene una propiedad 'menu' que contiene el array
    menuData = data.menu || [];
    // Guardamos una copia inicial en localStorage para persistencia de sesión
    saveToLocalStorage();
    renderMenu();
    updateJsonView();
  } catch (err) {
    // Mensaje visible si fetch falla
    showMessage("Error cargando menu.json. Abre la página desde un servidor local.", true);
    console.error(err);
  }
}

/* -------------------------
   3) RENDER: dibuja el menú dentro del nav#menu
   - Soporta submenus si el item incluye 'submenu' (array).
   - Añade botones de editar y borrar para cada elemento.
   ------------------------- */
function renderMenu() {
  // Limpiamos el contenedor antes de dibujar
  menuContainer.innerHTML = "";

  // Recorremos solo los items 'padre' (sin parent — en este ejemplo simple
  // usamos un enfoque: los submenús se guardan dentro de item.submenu)
  menuData.forEach(item => {
    // Contenedor raíz del item
    const itemEl = document.createElement("div");
    itemEl.className = "menu-block";

    // Enlace principal del menú
    const link = document.createElement("a");
    link.className = "menu-item";
    // Si el enlace es relativo, lo dejamos; si es URL completa, también.
    link.href = item.enlace || "#";
    link.innerHTML = `${item.icon ? item.icon + " " : ""}<span class="menu-label">${escapeHtml(item.nombre)}</span>`;
    // Prevent navigation during demo if enlace es '#'
    if (link.href.endsWith("#")) {
      link.addEventListener("click", (e) => e.preventDefault());
    }

    itemEl.appendChild(link);

    // Si tiene submenu, creamos un contenedor <div> con los items
    if (Array.isArray(item.submenu) && item.submenu.length > 0) {
      const submenuWrapper = document.createElement("div");
      submenuWrapper.className = "submenu";
      item.submenu.forEach(sub => {
        const s = document.createElement("a");
        s.href = sub.enlace || "#";
        s.className = "menu-item sub";
        s.textContent = escapeHtml(sub.nombre);
        // evitar navegación en demo
        if (s.href.endsWith("#")) s.addEventListener("click", (e) => e.preventDefault());
        submenuWrapper.appendChild(s);
      });
      itemEl.appendChild(submenuWrapper);
    }

    // CONTROLES (editar / eliminar) — los colocamos dentro del bloque del item
    const actions = document.createElement("span");
    actions.className = "menu-actions";

    // Editar
    const editBtn = document.createElement("button");
    editBtn.className = "btn-small";
    editBtn.title = "Editar esta opción";
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => startEdit(item.id));

    // Eliminar
    const delBtn = document.createElement("button");
    delBtn.className = "btn-small";
    delBtn.title = "Eliminar esta opción";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", () => deleteItem(item.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    itemEl.appendChild(actions);

    menuContainer.appendChild(itemEl);
  });

  // Después de renderizar guardamos la vista JSON también
  updateJsonView();
}

/* -------------------------
   4) GESTIÓN DEL FORMULARIO (añadir / editar)
   - Si editingId está vacío => nuevo item.
   - Si tiene valor => actualizamos item.
   - Validaciones:
       * nombre no vacío
       * enlace debe empezar por '/' o 'http(s)://'
       * id único (lo genera la función nextId)
   - Si parentId está presente y coincide con un item -> se inserta como submenu.
   ------------------------- */
menuForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const editingId = editingIdInput.value ? Number(editingIdInput.value) : null;
  const nombre = nombreInput.value.trim();
  const enlace = enlaceInput.value.trim();
  const icono = iconoInput.value.trim();
  const parentId = parentIdInput.value ? Number(parentIdInput.value) : null;

  // Validaciones simples
  if (!nombre) {
    showMessage("El campo 'Nombre' es obligatorio.", true);
    return;
  }
  if (!validateUrl(enlace)) {
    showMessage("El enlace debe comenzar con '/' o con 'http(s)://'.", true);
    return;
  }

  if (editingId) {
    // Actualizar elemento existente
    const item = findById(editingId);
    if (!item) {
      showMessage("Elemento a editar no encontrado.", true);
      return;
    }
    item.nombre = nombre;
    item.enlace = enlace;
    item.icon = icono || "";
    // Si tiene parentId, y es distinto, podemos moverlo — en este ejemplo simple,
    // no movemos items entre padres, a menos que se pida explícito.
    showMessage("Elemento actualizado.", false);
  } else {
    // Crear nuevo elemento
    const newId = nextId();
    const newItem = {
      id: newId,
      nombre,
      enlace,
      icon: icono || ""
    };

    if (parentId) {
      // se busca el padre para insertar en su submenu
      const parent = findById(parentId);
      if (!parent) {
        showMessage("Parent ID no encontrado. El elemento se añadirá como nivel principal.", false);
        menuData.push(newItem);
      } else {
        parent.submenu = parent.submenu || [];
        parent.submenu.push(newItem);
      }
    } else {
      // añadimos en primer nivel
      menuData.push(newItem);
    }
    showMessage("Nueva opción añadida.", false);
  }

  // Guardar y renderizar
  saveToLocalStorage();
  renderMenu();
  resetForm();
});

/* -------------------------
   5) FUNCIONES AUXILIARES
   ------------------------- */

/**
 * nextId()
 * Devuelve un id numérico único (simple).
 * - Busca el mayor id actual y devuelve mayor+1.
 * - Considera también ids dentro de submenus.
 */
function nextId() {
  let max = 0;
  function check(item) {
    if (item.id && item.id > max) max = item.id;
    if (item.submenu && item.submenu.length) {
      item.submenu.forEach(check);
    }
  }
  menuData.forEach(check);
  return max + 1;
}

/**
 * findById(id)
 * Busca recursivamente un item por su id (nivel principal y submenus).
 */
function findById(id) {
  let found = null;
  function search(arr) {
    for (const it of arr) {
      if (it.id === id) return it;
      if (it.submenu) {
        const r = search(it.submenu);
        if (r) return r;
      }
    }
    return null;
  }
  return search(menuData);
}

/**
 * deleteItem(id)
 * Elimina un item por id (si es padre lo elimina junto a su submenu).
 * Pregunta confirmación antes de borrar.
 */
function deleteItem(id) {
  if (!confirm("¿Seguro que deseas eliminar esta opción?")) return;

  // Función que filtra recursivamente
  function filterOut(arr) {
    return arr.filter(it => {
      if (it.id === id) return false;
      if (it.submenu) it.submenu = filterOut(it.submenu);
      return true;
    });
  }

  menuData = filterOut(menuData);
  saveToLocalStorage();
  renderMenu();
  showMessage("Elemento eliminado.", false);
}

/**
 * startEdit(id)
 * Pone los datos del item en el formulario para editar.
 */
function startEdit(id) {
  const item = findById(id);
  if (!item) {
    showMessage("Elemento no encontrado para editar.", true);
    return;
  }
  editingIdInput.value = item.id;
  nombreInput.value = item.nombre || "";
  enlaceInput.value = item.enlace || "";
  iconoInput.value = item.icon || "";
  parentIdInput.value = ""; // no movemos padres automáticamente
  showMessage("Editando elemento (haz cambios y presiona Guardar).", false);
}

/**
 * resetForm()
 * Limpia el formulario y el estado de edición.
 */
function resetForm() {
  editingIdInput.value = "";
  menuForm.reset();
}

/**
 * validateUrl(url)
 * Validación básica: acepta rutas relativas que comienzan con '/'
 * o URLs absolutas que comienzan con http:// o https://
 */
function validateUrl(url) {
  if (!url) return false;
  const pattern = /^(\/|https?:\/\/).+/i;
  return pattern.test(url);
}

/**
 * saveToLocalStorage()
 * Guarda 'menuData' en localStorage (persistencia del cliente).
 */
function saveToLocalStorage() {
  try {
    localStorage.setItem("menuData", JSON.stringify(menuData));
  } catch (err) {
    console.error("Error guardando en localStorage", err);
  }
}

/**
 * showMessage(msg, isError)
 * Muestra mensajes al usuario en el recuadro 'message'.
 */
function showMessage(msg, isError = false) {
  messageBox.textContent = msg;
  messageBox.style.color = isError ? "#b02a37" : "#0b5ed7";
  // desaparecer después de 4s
  setTimeout(() => {
    messageBox.textContent = "";
  }, 4000);
}

/**
 * updateJsonView()
 * Actualiza la vista del JSON en el panel lateral para que el usuario vea la estructura actual.
 */
function updateJsonView() {
  // Construimos un objeto con la propiedad 'menu' para facilitar exportación
  const obj = { menu: menuData };
  jsonView.textContent = JSON.stringify(obj, null, 2);
}

/* -------------------------
   6) Exportar JSON (descargar)
   - Crea un Blob con los datos actuales y simula la descarga.
   ------------------------- */
exportBtn.addEventListener("click", () => {
  const dataStr = JSON.stringify({ menu: menuData }, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "menu-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showMessage("Archivo JSON preparado para descarga.", false);
});

/* -------------------------
   7) Restablecer al JSON original (limpiar localStorage y recargar menu.json)
   ------------------------- */
resetBtn.addEventListener("click", () => {
  if (!confirm("Esto restablecerá el menú a menu.json y eliminará los cambios locales. ¿Continuar?")) return;
  localStorage.removeItem("menuData");
  // recargamos desde archivo original
  cargarMenu();
  showMessage("Datos restablecidos al contenido de menu.json.", false);
});

/* -------------------------
   8) Cancelar edición
   ------------------------- */
cancelEditBtn.addEventListener("click", (e) => {
  resetForm();
  showMessage("Edición cancelada.", false);
});

/* -------------------------
   9) Toggle menú (móvil)
   ------------------------- */
menuToggleBtn.addEventListener("click", () => {
  const expanded = menuToggleBtn.getAttribute("aria-expanded") === "true";
  menuToggleBtn.setAttribute("aria-expanded", String(!expanded));
  menuContainer.classList.toggle("active");
});

/* -------------------------
   10) Escape HTML (previene inyecciones sencillas en la vista)
   ------------------------- */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* -------------------------
   11) Inicialización: cargar datos al iniciar la app
   ------------------------- */
cargarMenu();
