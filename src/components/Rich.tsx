import { createElement, useMemo, type ElementType, type HTMLAttributes } from 'react'
import { toRenderHtml } from '../lib/rich'

interface Props extends HTMLAttributes<HTMLElement> { as?: ElementType; html: string; path: string }

/** Renders a rich dictionary string; `data-rich` tells the editor it may format the selection. */
export function Rich({ as = 'span', html, path, className, ...rest }: Props) {
  const __html = useMemo(() => toRenderHtml(html), [html])
  return createElement(as, { ...rest, className, 'data-rich': path, dangerouslySetInnerHTML: { __html } })
}
