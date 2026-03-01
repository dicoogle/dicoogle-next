
import { BaseTool } from '@cornerstonejs/tools';
import * as cornerstone from '@cornerstonejs/core';
import { annotation } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';

/**
 * MagicWandTool - Click-based region growing segmentation tool
 */
class MagicWandTool extends BaseTool {
  static toolName = 'MagicWand';
  static supportedInteractionTypes = ['Mouse', 'Touch'];

  constructor(toolProps = {}, defaultToolProps = {}) {
    super(toolProps, {
      ...defaultToolProps,
      supportedInteractionTypes: ['Mouse', 'Touch'],
    });

    this.configuration = {
      tolerance: 10,
      maxIterations: 10000,
      ...(this.configuration ?? {}),
    };
  }

  setTolerance(value: number) {
    if (!this.configuration) {
      this.configuration = {};
    }

    this.configuration.tolerance = Math.max(0, Math.min(255, value));
  }

  getTolerance(): number {
    return this.configuration?.tolerance ?? 10;
  }

  /**
   * Handle mouse move - required by BaseTool
   */
  mouseMoveCallback = (): void => {
    // No action needed on mouse move
    return;
  };

  /**
   * Handle mouse down - this is where the tool activates
   */
  mouseDownCallback = (evt: any): boolean => {
    return this.handleActivation(evt);
  };

  mouseClickCallback = (evt: any): boolean => {
    return this.handleActivation(evt);
  };

  private handleActivation(evt: any): boolean {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = cornerstone.getEnabledElement(element);

    if (!enabledElement) {
      return false;
    }

    const { viewport } = enabledElement;
    const canvasPos = eventDetail?.currentPoints?.canvas;

    if (!canvasPos) {
      return false;
    }

    const worldPos = viewport.canvasToWorld(canvasPos);
    this.performRegionGrowing(viewport, worldPos, canvasPos, element);

    evt.preventDefault();
    return true;
  }

  private performRegionGrowing(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    seedPoint: Types.Point3,
    canvasPos: Types.Point2,
    element: HTMLDivElement
  ) {
    try {
      const imageData = viewport.getImageData();
      if (!imageData) {
        return;
      }

      const { dimensions, scalarData } = imageData;
      const [width, height] = dimensions;

      const indexPoint = this.getIndexFromCanvas(viewport, canvasPos, seedPoint);
      if (!indexPoint) return;

      const [ix, iy] = indexPoint;
      const x = Math.round(ix);
      const y = Math.round(iy);

      if (x < 0 || x >= width || y < 0 || y >= height) {
        return;
      }

      const seedIndex = y * width + x;
      const seedValue = scalarData[seedIndex];

      const tolerance = this.getTolerance();
      const mask = this.floodFill(
        scalarData,
        width,
        height,
        x,
        y,
        seedValue,
        tolerance
      );

      let count = 0;
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          if (mask[i][j]) count++;
        }
      }

      if (count < 3) {
        return;
      }

      this.createAnnotationFromMask(viewport, mask, width, height, element);
      viewport.render();
    } catch (error) {
      console.error('[MagicWand] Error during region growing:', error);
    }
  }

  private getIndexFromCanvas(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    canvasPos: Types.Point2,
    seedPoint: Types.Point3
  ): [number, number] | null {
    const canvasToIndex = (viewport as any).canvasToIndex;
    if (typeof canvasToIndex === 'function') {
      const result = canvasToIndex(canvasPos);
      if (Array.isArray(result)) {
        return [result[0], result[1]];
      }
      if (result?.x !== undefined && result?.y !== undefined) {
        return [result.x, result.y];
      }
    }

    const worldToIndex = (viewport as any).worldToIndex;
    if (typeof worldToIndex === 'function') {
      const result = worldToIndex(seedPoint);
      if (Array.isArray(result)) {
        return [result[0], result[1]];
      }
      if (result?.x !== undefined && result?.y !== undefined) {
        return [result.x, result.y];
      }
    }

    const imageData = viewport.getImageData();
    const imageDataWorldToIndex = (imageData as any)?.worldToIndex;
    if (typeof imageDataWorldToIndex === 'function') {
      const result = imageDataWorldToIndex(seedPoint);
      if (Array.isArray(result)) {
        return [result[0], result[1]];
      }
      if (result?.x !== undefined && result?.y !== undefined) {
        return [result.x, result.y];
      }
    }

    return null;
  }

  private floodFill(
    data: any,
    width: number,
    height: number,
    startX: number,
    startY: number,
    targetValue: number,
    tolerance: number
  ): boolean[][] {
    const mask: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const queue: [number, number][] = [[startX, startY]];
    const visited = new Set<string>();

    let iterations = 0;
    const minValue = targetValue - tolerance;
    const maxValue = targetValue + tolerance;
    const maxIterations = this.configuration?.maxIterations ?? 10000;

    while (queue.length > 0 && iterations < maxIterations) {
      iterations++;
      const [x, y] = queue.shift()!;
      const key = `${x},${y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const index = y * width + x;
      const value = data[index];

      if (value < minValue || value > maxValue) continue;

      mask[y][x] = true;

      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }

    return mask;
  }

  private createAnnotationFromMask(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    mask: boolean[][],
    width: number,
    height: number,
    element: HTMLDivElement
  ) {
    const contourPoints = this.extractContour(mask, width, height);

    if (contourPoints.length < 3) {
      console.warn('[MagicWand] Not enough contour points');
      return;
    }

    const indexToWorld = (viewport as any).indexToWorld;
    const imageDataIndexToWorld = (viewport.getImageData() as any)?.indexToWorld;
    const worldPoints = contourPoints.map(([x, y]) => {
      if (typeof indexToWorld === 'function') {
        return indexToWorld([x, y, 0]);
      }
      if (typeof imageDataIndexToWorld === 'function') {
        return imageDataIndexToWorld([x, y, 0]);
      }
      const canvasPoint: Types.Point2 = [x, y];
      return viewport.canvasToWorld(canvasPoint);
    });

    const camera = viewport.getCamera();
    const annotationUID = cornerstone.utilities.uuidv4();

    const newAnnotation: any = {
      annotationUID,
      metadata: {
        toolName: 'PlanarFreehandROI',
        viewPlaneNormal: camera.viewPlaneNormal as Types.Point3,
        viewUp: camera.viewUp as Types.Point3,
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
      },
      data: {
        handles: {
          points: worldPoints,
          textBox: {
            hasMoved: false,
            worldPosition: worldPoints[0],
            worldBoundingBox: undefined,
          },
          activeHandleIndex: null,
        },
        contour: {
          polyline: worldPoints,
          closed: true,
        },
        label: `Magic Wand (${contourPoints.length} pts)`,
        isClosed: true,
        cachedStats: {},
      },
      highlighted: true,
      invalidated: true,
    };

    if ('getCurrentImageId' in viewport) {
      newAnnotation.metadata.referencedImageId = (viewport as Types.IStackViewport).getCurrentImageId();
    }

    annotation.state.addAnnotation(newAnnotation, element);
  }

  private extractContour(mask: boolean[][], width: number, height: number): [number, number][] {
    const contour: [number, number][] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y][x] && this.isEdgePixel(mask, x, y, width, height)) {
          contour.push([x, y]);
        }
      }
    }

    return this.simplifyContour(contour, 3);
  }

  private isEdgePixel(mask: boolean[][], x: number, y: number, width: number, height: number): boolean {
    if (!mask[y][x]) return false;

    const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny][nx]) {
        return true;
      }
    }

    return false;
  }

  private simplifyContour(points: [number, number][], step: number): [number, number][] {
    if (points.length < 3) return points;

    const simplified: [number, number][] = [];

    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i]);
    }

    const lastSimplified = simplified[simplified.length - 1];
    const lastPoint = points[points.length - 1];
    if (!lastSimplified || lastSimplified[0] !== lastPoint[0] || lastSimplified[1] !== lastPoint[1]) {
      simplified.push(lastPoint);
    }

    return simplified;
  }
}

MagicWandTool.toolName = 'MagicWand';

export default MagicWandTool;
