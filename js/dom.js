// Gemeinsame DOM-Helfer; Texte werden immer als Text eingefügt (kein HTML)

const Dom = (() => {
  // props: class, on<Event> (Listener), sonstige Attribute; null/false werden übersprungen
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value === false || value == null) return;
      if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach(child => {
      if (child != null && child !== false) node.append(child);
    });
    return node;
  }

  return { h };
})();
