// Actualiza en vivo el recuadro de requisitos faltantes del formulario de nuevo trámite.
(function () {
  const items = document.querySelectorAll('[data-requisito]');
  const alerta = document.getElementById('resumen-requisitos');
  const completos = document.getElementById('requisitos-completos');
  if (!items.length || !alerta) return;
  const lista = alerta.querySelector('[data-lista-faltantes]');

  function cumple(item) {
    const campo = item.querySelector('[data-cumple]');
    return campo.type === 'file' ? campo.files.length > 0 : campo.checked;
  }

  function actualizar() {
    const faltantes = [];
    items.forEach(function (item) {
      const noAplica = item.querySelector('[data-no-aplica]');
      const ok = cumple(item);
      // "No aplica" solo tiene sentido si no se presentó el requisito
      if (noAplica) {
        noAplica.disabled = ok;
        if (ok) noAplica.checked = false;
      }
      const resuelto = ok || (noAplica && noAplica.checked);
      item.classList.toggle('cumplido', ok);
      item.classList.toggle('no-aplica', !ok && !!(noAplica && noAplica.checked));
      if (!resuelto) faltantes.push(item.dataset.nombre);
    });

    lista.innerHTML = '';
    faltantes.forEach(function (nombre) {
      const li = document.createElement('li');
      li.textContent = nombre;
      lista.appendChild(li);
    });
    alerta.classList.toggle('oculto', faltantes.length === 0);
    completos.classList.toggle('oculto', faltantes.length > 0);
  }

  document.addEventListener('change', actualizar);
  actualizar();
})();
