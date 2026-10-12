/* ============================================================================
 * js/services/repository.js — FACTORÍA DE SERVICIOS POR DOMINIO (Mock API)
 * Cada servicio es una fachada delgada sobre window.Store + colección.
 * Misma firma CRUD en todos: getAll/getById/crear/actualizar/eliminar.
 * Así, migrar a backend propio = reescribir Store, no cada módulo.
 *
 * Colecciones reales detectadas en el monolito (grep db.*):
 *   lessons, categories, exams, examAttempts, enrollments, progress,
 *   liveClasses, groups, groupMessages, messages, posts, notifications,
 *   ventas, metas, convenciones, clientes, solicitudes, cotizaciones,
 *   siniestros, autoHub/autoCartera, finCartera, inmCartera/inmPublica,
 *   tasks, taskSubmissions, library, generations, planes, cierresComunidad,
 *   carruselCirculares, glossaryCategories, glossaryConcepts, settings...
 * ========================================================================== */
(function () {
  'use strict';

  function makeRepo(collection, opts) {
    opts = opts || {};
    return {
      collection: collection,
      getAll: function () { return window.Store.getAll(collection); },
      getById: function (id) { return window.Store.getById(collection, id); },
      crear: function (datos) {
        var rec = window.Store.insert(collection, Object.assign({}, datos));
        if (opts.audit !== false) window.Store.audit('creacion_' + collection, { id: rec.id });
        return rec;
      },
      actualizar: function (id, patch) { return window.Store.update(collection, id, patch); },
      eliminar: function (id) {
        var ok = window.Store.remove(collection, id);
        if (ok && opts.audit !== false) window.Store.audit('borrado_' + collection, { id: id });
        return ok;
      },
      filtrar: function (fn) { return this.getAll().filter(fn); }
    };
  }

  // ---- Academia: lecciones / exámenes / grupos / chat / notificaciones ----
  window.coursesService = makeRepo('lessons');
  window.coursesService.getByCategory = function (categoryId) {
    return this.filtrar(function (l) { return String(l.categoryId) === String(categoryId); });
  };
  window.categoriesService = makeRepo('categories');
  window.examsService = makeRepo('exams');
  window.examAttemptsService = makeRepo('examAttempts');
  window.enrollmentsService = makeRepo('enrollments');
  window.progressService = makeRepo('progress');
  window.liveClassesService = makeRepo('liveClasses');
  window.liveClassesService.proximasPara = function (userId) {
    var now = new Date();
    return this.filtrar(function (c) {
      return (c.assignedTo || []).indexOf(userId) !== -1 && new Date(c.end) >= now;
    });
  };
  window.groupsService = makeRepo('groups');
  window.chatService = makeRepo('groupMessages');       // chat de grupos
  window.chatService.porGrupo = function (groupId) {
    return this.filtrar(function (m) { return String(m.groupId) === String(groupId); });
  };
  window.directMessagesService = makeRepo('messages');  // mensajes directos
  window.postsService = makeRepo('posts');

  window.notificationsService = makeRepo('notifications', { audit: false });
  window.notificationsService.noLeidasPara = function (user) {
    var allowed = ['admin', 'gm', 'agencia', 'desarrollador'];
    if (allowed.indexOf(String((user || {}).role || '').toLowerCase()) === -1) return [];
    return this.filtrar(function (n) { return !(n.readBy || []).indexOf(user.id) !== -1 && !(n.readBy || []).includes(user.id); });
  };
  window.notificationsService.marcarLeidas = function (user) {
    this.getAll().forEach(function (n) {
      if (!n.readBy) n.readBy = [];
      if (n.readBy.indexOf(user.id) === -1) n.readBy.push(user.id);
    });
    window.Store.save();
  };

  // ---- Comercial: ventas / metas / solicitudes / cotizaciones / siniestros --
  window.ventasService = makeRepo('ventas');
  window.ventasService.porAgente = function (agenteId) {
    return this.filtrar(function (v) {
      return String(v.agenteId) === String(agenteId) || String(v.agente) === String(agenteId);
    });
  };
  window.ventasService.enPeriodo = function (tab) {
    var now = new Date();
    return this.filtrar(function (v) {
      var d = new Date(v.fecha || v.ts || Date.now());
      if (tab === 'mensual') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (tab === 'trimestral') {
        return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) && d.getFullYear() === now.getFullYear();
      }
      return d.getFullYear() === now.getFullYear();
    });
  };
  window.metasService = makeRepo('metas');
  window.convencionesService = makeRepo('convenciones');
  window.clientesService = makeRepo('clientes');
  window.solicitudesService = makeRepo('solicitudes');
  window.cotizacionesService = makeRepo('cotizaciones');
  window.siniestrosService = makeRepo('siniestros');

  // ---- Inventarios: autos / financiera / inmuebles (+ carteras) -------------
  window.autosService = makeRepo('autoHub');
  window.autosService.cartera = function () { return window.Store.getAll('autoCartera'); };
  window.financieraService = makeRepo('finCartera');
  window.inmueblesService = makeRepo('inmCartera');
  window.inmueblesService.publicados = function () { return window.Store.getAll('inmPublica'); };

  // ---- Contenido / comunidad / práctica -------------------------------------
  window.tasksService = makeRepo('tasks');
  window.taskSubmissionsService = makeRepo('taskSubmissions');
  window.libraryService = makeRepo('library');
  window.carruselService = makeRepo('carruselCirculares');
  window.glossaryService = makeRepo('glossaryConcepts');
  window.glossaryCategoriesService = makeRepo('glossaryCategories');
  window.comunidadService = makeRepo('cierresComunidad');
  window.practicaService = makeRepo('practicaSesiones', { audit: false });
  window.practicaService.porUsuario = function (userId) {
    return this.filtrar(function (s) { return String(s.usuarioId) === String(userId); })
      .sort(function (a, b) { return b.inicio - a.inicio; });
  };
  window.generationsService = makeRepo('generations');
  window.planesService = makeRepo('planes');
  window.settingsService = {
    get: function () { return window.Store.settings(); },
    actualizar: function (patch) {
      var s = window.Store.settings();
      Object.assign(s, patch);
      window.Store.save();
      return s;
    }
  };
})();
