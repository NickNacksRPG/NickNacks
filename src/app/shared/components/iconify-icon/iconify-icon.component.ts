import { Component, Input } from '@angular/core';

/**
 * Renders icons from two sources:
 * 1. SVG files in the icons/ folder (resolved at build time via iconSvg path)
 * 2. Emoji characters (rendered as text)
 *
 * When `icon` starts with "icons/" it's treated as an SVG path and rendered
 * as an <img> tag. Otherwise it's treated as an emoji and rendered as text.
 *
 * Usage:
 *   <app-iconify-icon [icon]="note.iconSvg || note.icon" [size]="20" />
 *   <app-iconify-icon icon="icons/sword.svg" [size]="24" />
 *   <app-iconify-icon icon="🔥" [size]="20" />
 */
@Component({
  selector: 'app-iconify-icon',
  standalone: true,
  template: `
    @if (isSvg) {
      <img [src]="icon" [style.width.px]="parsedSize" [style.height.px]="parsedSize"
           [style.color]="color" class="svg-icon" alt="" />
    } @else if (isEmoji) {
      <span class="emoji-icon" [style.font-size.px]="parsedSize">{{ icon }}</span>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .svg-icon {
      display: inline-flex;
      vertical-align: middle;
    }
    .emoji-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
  `]
})
export class IconifyIconComponent {
  /** Icon value: SVG path (e.g. "icons/sword.svg") or emoji text */
  @Input() icon?: string;

  /** Size in pixels (number or string like "20") */
  @Input() set size(v: string | number) {
    this.parsedSize = typeof v === 'string' ? parseInt(v, 10) || 16 : v;
  }

  /** Icon color (only used for future inline-SVG rendering) */
  @Input() color: string = 'currentColor';

  protected parsedSize = 16;

  /** True if icon is a resolved SVG path */
  get isSvg(): boolean {
    return typeof this.icon === 'string' && this.icon.startsWith('icons/');
  }

  /** True if icon looks like an emoji (non-ASCII) */
  get isEmoji(): boolean {
    if (typeof this.icon !== 'string' || this.icon.startsWith('icons/')) return false;
    return [...this.icon].some(c => c.codePointAt(0)! > 0x2000);
  }
}
