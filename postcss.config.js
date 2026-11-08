import autoprefixer from 'autoprefixer'

// Les effets de survol ne s'appliquent qu'aux appareils avec souris : au doigt,
// un :hover reste « collé » après l'appui. Toute règle :hover du projet passe par ici.
const hoverOnly = () => ({
  postcssPlugin: 'hover-only',
  Once(root, { AtRule }) {
    root.walkRules((rule) => {
      if (!rule.selector.includes(':hover')) return
      if (rule.parent.type === 'atrule' && /hover/.test(rule.parent.params)) return
      const hover = rule.selectors.filter(sel => sel.includes(':hover'))
      const others = rule.selectors.filter(sel => !sel.includes(':hover'))
      const media = new AtRule({ name: 'media', params: '(hover: hover)' })
      media.append(rule.clone({ selectors: hover }))
      rule.after(media)
      if (others.length) rule.selectors = others
      else rule.remove()
    })
  },
})
hoverOnly.postcss = true

export default {
  plugins: [autoprefixer(), hoverOnly()],
}
