import { Component, input } from '@angular/core';

/**
 * Footer Component
 *
 * Displays the application footer bar with:
 * - Copyright information
 * - Quick links (Privacy, Terms, Contact)
 *
 * Design decisions:
 * - Stateless presentation component
 * - Receives state for responsive positioning
 * - Can be extended with dynamic links via input
 */
@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  // Inputs for dynamic positioning based on sidebar states
  readonly leftSidebarOpen = input.required<boolean>();
  readonly rightSidebarOpen = input.required<boolean>();
  readonly appName = input.required<string>();
  readonly currentYear = new Date().getFullYear();
}
