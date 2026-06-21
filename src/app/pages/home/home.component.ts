import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Home component - Landing page with welcome content
 * 
 * Demonstrates the main content area of the application layout.
 * This component is route-activated and displayed in the router-outlet.
 */
@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  protected readonly cards = [
    {
      title: 'Dashboard',
      description: 'View your analytics and key metrics at a glance.',
      icon: 'dashboard',
      color: '#1976d2'
    },
    {
      title: 'Projects',
      description: 'Manage and track all your active projects.',
      icon: 'work',
      color: '#388e3c'
    },
    {
      title: 'Team',
      description: 'Collaborate with team members and manage permissions.',
      icon: 'group',
      color: '#f57c00'
    },
    {
      title: 'Reports',
      description: 'Generate detailed reports and export data.',
      icon: 'assessment',
      color: '#7b1fa2'
    }
  ];
}

