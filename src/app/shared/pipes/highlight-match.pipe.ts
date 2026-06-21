import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Pipe to highlight matched text in search snippets
 * Converts ★text★ markers to <strong> tags
 *
 * Design decisions:
 * - Uses star (★) markers as placeholders for matched text
 * - Converts markers to strong tags for visual emphasis
 * - Returns SafeHtml to preserve HTML structure
 */
@Pipe({
  name: 'highlightMatch',
  standalone: true,
})
export class HighlightMatchPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | undefined): SafeHtml {
    if (!text) {
      return '';
    }

    // Replace ★text★ with <strong>text</strong>
    const highlighted = text.replace(/★([^★]+)★/g, '<strong>$1</strong>');

    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
}

