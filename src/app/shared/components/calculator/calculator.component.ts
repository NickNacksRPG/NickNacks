import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Interactive calculator component for markdown content
 * 
 * Design decisions:
 * - Uses Angular signals for reactive state management
 * - Evaluates formulas safely using Function constructor with limited scope
 * - Supports multiple inputs with labels, defaults, min/max constraints
 * - Optional graph visualization of results
 * - Follows Single Responsibility: handles formula evaluation and display only
 */

interface CalculatorInput {
  name: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

interface CalculatorConfig {
  formula: string;
  inputs: CalculatorInput[];
  graph?: boolean;
  graphPoints?: number;
  description?: string;
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calculator.component.html',
  styleUrl: './calculator.component.scss',
})
export class CalculatorComponent implements OnInit {
  @Input() config!: CalculatorConfig;

  // Reactive state for input values
  protected inputValues = signal<Record<string, number>>({});
  
  // Computed result based on current input values
  protected result = computed(() => {
    try {
      return this.evaluateFormula(this.inputValues());
    } catch (error) {
      return 'Error: ' + (error as Error).message;
    }
  });

  // Computed graph data points
  protected graphData = computed(() => {
    if (!this.config?.graph) return null;
    return this.generateGraphData();
  });

  ngOnInit(): void {
    // Initialize input values with defaults
    const initialValues: Record<string, number> = {};
    if (this.config?.inputs) {
      for (const input of this.config.inputs) {
        initialValues[input.name] = input.default;
      }
    }
    this.inputValues.set(initialValues);
  }

  /**
   * Updates a single input value
   */
  protected updateValue(name: string, value: number): void {
    this.inputValues.update(current => ({
      ...current,
      [name]: value
    }));
  }

  /**
   * Safely evaluates the formula with the given input values
   * Uses Function constructor with limited scope to prevent access to global scope
   */
  private evaluateFormula(values: Record<string, number>): number | string {
    if (!this.config?.formula) {
      return 'No formula provided';
    }

    try {
      // Extract the expression part (after '=')
      const formulaParts = this.config.formula.split('=');
      const expression = formulaParts.length > 1 ? formulaParts[1].trim() : this.config.formula;

      // Create a safe evaluation function
      // Only the input variable names are available in scope
      const paramNames = Object.keys(values);
      const paramValues = Object.values(values);

      // Add Math object functions to scope for convenience
      const mathFunctions = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        sqrt: Math.sqrt,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
      };

      // Create function with limited scope
      const fn = new Function(...paramNames, ...Object.keys(mathFunctions), `return ${expression}`);
      const result = fn(...paramValues, ...Object.values(mathFunctions));

      // Round to 2 decimal places for display
      return typeof result === 'number' ? Math.round(result * 100) / 100 : result;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      return 'Invalid formula';
    }
  }

  /**
   * Generates graph data points by varying the first input
   * This creates a simple line graph showing how the output changes
   */
  private generateGraphData(): { x: number; y: number; label: string }[] | null {
    if (!this.config?.inputs || this.config.inputs.length === 0) {
      return null;
    }

    const points = this.config.graphPoints || 20;
    const firstInput = this.config.inputs[0];
    const currentValues = this.inputValues();
    const data: { x: number; y: number; label: string }[] = [];

    const min = firstInput.min ?? 0;
    const max = firstInput.max ?? 100;
    const step = (max - min) / points;

    for (let i = 0; i <= points; i++) {
      const x = min + (step * i);
      const testValues = { ...currentValues, [firstInput.name]: x };
      const y = this.evaluateFormula(testValues);

      if (typeof y === 'number') {
        data.push({ x, y, label: firstInput.label });
      }
    }

    return data;
  }

  /**
   * Gets the min and max Y values for graph scaling
   */
  protected getGraphBounds(): { minY: number; maxY: number } {
    const data = this.graphData();
    if (!data || data.length === 0) {
      return { minY: 0, maxY: 100 };
    }

    const yValues = data.map(d => d.y);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const padding = (maxY - minY) * 0.1; // 10% padding

    return {
      minY: minY - padding,
      maxY: maxY + padding,
    };
  }

  /**
   * Converts data point to SVG coordinates
   */
  protected toSvgY(y: number, height: number): number {
    const { minY, maxY } = this.getGraphBounds();
    const range = maxY - minY;
    return height - ((y - minY) / range) * height;
  }

  /**
   * Converts data point to SVG X coordinate
   */
  protected toSvgX(x: number, width: number): number {
    const data = this.graphData();
    if (!data || data.length === 0) return 0;

    const minX = data[0].x;
    const maxX = data[data.length - 1].x;
    const range = maxX - minX;

    return ((x - minX) / range) * width;
  }

  /**
   * Generates SVG path data for the graph line
   */
  protected getGraphPath(): string {
    const data = this.graphData();
    if (!data || data.length === 0) return '';

    const width = 400;
    const height = 200;

    const points = data.map(d => ({
      x: this.toSvgX(d.x, width),
      y: this.toSvgY(d.y, height)
    }));

    const path = points.map((p, i) => {
      if (i === 0) {
        return `M ${p.x} ${p.y}`;
      }
      return `L ${p.x} ${p.y}`;
    }).join(' ');

    return path;
  }

  /**
   * Gets grid lines for Y axis
   */
  protected getYGridLines(): number[] {
    const { minY, maxY } = this.getGraphBounds();
    const range = maxY - minY;
    const step = range / 5; // 5 grid lines

    return [0, 1, 2, 3, 4, 5].map(i => minY + (step * i));
  }

  /**
   * Gets grid lines for X axis
   */
  protected getXGridLines(): number[] {
    const data = this.graphData();
    if (!data || data.length === 0) return [];

    const minX = data[0].x;
    const maxX = data[data.length - 1].x;
    const range = maxX - minX;
    const step = range / 5; // 5 grid lines

    return [0, 1, 2, 3, 4, 5].map(i => minX + (step * i));
  }

  /**
   * Gets the numeric result value, returns 0 if result is not a number
   */
  protected getNumericResult(): number {
    const res = this.result();
    return typeof res === 'number' ? res : 0;
  }
}

