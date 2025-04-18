/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface ImageProcessorProps {
  image: HTMLImageElement;
}

interface FilterState {
  type: 'none' | 'grayscale' | 'etching' | 'stamp' | 'comic';
  threshold: number;
}

interface StampParams {
  smoothSharp: number; // 0 (smooth) to 100 (sharp)
  lightDark: number; // 0 (light) to 100 (dark)
  thickThin: number; // 0 (thin) to 100 (thick)
  denseSparse: number; // 0 (dense) to 100 (sparse)
}

const ImageProcessor: React.FC<ImageProcessorProps> = ({ image }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filter, setFilter] = useState<FilterState>({ type: 'none', threshold: 25 });
  const [params, setParams] = useState<StampParams>({
    smoothSharp: 39,
    lightDark: 50,
    thickThin: 61,
    denseSparse: 50,
  })
  const [isOpenCvReady, setIsOpenCvReady] = useState<boolean>(
    (window as any).opencvReady || false
  );
  const cvRef = useRef<any>(null)

  useLayoutEffect(() => {

    const getCvRef = async () => {
      const cv = await window.cv

      cvRef.current = cv

      if (cv) {
        window.opencvReady = true
        setIsOpenCvReady(true)

      }
    }
    getCvRef()
  }, [])



  // Apply filter
  useEffect(() => {
    if (!image || !canvasRef.current || !isOpenCvReady) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const cv = cvRef.current

    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    let src = cv.imread(canvas);


    if (filter.type === 'grayscale') {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    } else if (filter.type === 'etching') {
      let dst = new cv.Mat();

      // Step 1: Convert to grayscale
      cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);

      // Step 2: Light blur to reduce noise in edges
      cv.GaussianBlur(src, dst, new cv.Size(3, 3), 0, 0);
      src.delete();
      src = dst;
      dst = new cv.Mat();

      // Step 3: Edge detection with Canny
      const denseSparseValue = filter.threshold / 100; // 0 (dense) to 1 (sparse)
      const lowThreshold = 50 * (1 - denseSparseValue); // 0 to 50
      const highThreshold = 150 * (1 - denseSparseValue); // 0 to 150
      cv.Canny(src, dst, lowThreshold, highThreshold);

      // Step 4: Threshold to binarize lines
      const threshold = 128 * (1 - denseSparseValue); // 0 to 128
      cv.threshold(dst, dst, threshold, 255, cv.THRESH_BINARY);

      // Step 5: Invert for black lines on white
      cv.bitwise_not(dst, dst);

      // Step 6: Convert to RGBA for display
      cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA);

      // Step 7: Display result
      cv.imshow(canvas, dst);
      src.delete();
      dst.delete();

    } else if (filter.type === 'stamp') {
      let dst = new cv.Mat();

      // Step 1: Grayscale
      cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);

      // Step 2: Smooth/Sharp
      const smoothSharpValue = params.smoothSharp / 100; // 0 (smooth) to 1 (sharp)
      if (smoothSharpValue < 0.5) {
        // Smooth: Apply Gaussian blur
        const kernelSize = Math.round(5 + 10 * (0.5 - smoothSharpValue)); // 5 to 15
        const ksize = new cv.Size(kernelSize | 1, kernelSize | 1); // Ensure odd
        cv.GaussianBlur(src, dst, ksize, 0, 0);
        src.delete();
        src = dst;
        dst = new cv.Mat();
      } else {
        // Sharp: Apply unsharp masking
        const blurred = new cv.Mat();
        const ksize = new cv.Size(5, 5);
        cv.GaussianBlur(src, blurred, ksize, 0, 0);
        cv.addWeighted(src, 1.5 + smoothSharpValue, blurred, -0.5 - smoothSharpValue, 0, dst);
        blurred.delete();
        src.delete();
        src = dst;
        dst = new cv.Mat();
      }

      // Step 3: Edge Detection (for dense/sparse)
      const denseSparseValue = params.denseSparse / 100; // 0 (dense) to 1 (sparse)
      const lowThreshold = 50 * (1 - denseSparseValue); // 0 to 50
      const highThreshold = 150 * (1 - denseSparseValue); // 0 to 150
      cv.Canny(src, dst, lowThreshold, highThreshold);
      src.delete();
      src = dst;
      dst = new cv.Mat();

      // Step 4: Thresholding (for light/dark)
      const lightDarkValue = params.lightDark / 100; // 0 (light) to 1 (dark)
      const threshold = 255 * (1 - lightDarkValue); // 0 (dark) to 255 (light)
      cv.threshold(src, dst, threshold, 255, cv.THRESH_BINARY);
      src.delete();
      src = dst;
      dst = new cv.Mat();

      // Step 5: Thick/Thin
      const thickThinValue = params.thickThin / 100; // 0 (thin) to 1 (thick)
      if (thickThinValue > 0.5) {
        // Thick: Dilate
        const kernelSize = Math.round(1 + 2 * (thickThinValue - 0.5)); // 1 to 2
        const kernel = cv.getStructuringElement(
          cv.MORPH_RECT,
          new cv.Size(kernelSize, kernelSize)
        );
        cv.dilate(src, dst, kernel);
        kernel.delete();
        src.delete();
        src = dst;
      } else {
        // Thin or neutral: No operation to avoid erasing lines
        dst = src; // Pass through unchanged
      }

      // Step 6: Add subtle noise for stamp texture
      // // Step 6: Add subtle noise for stamp texture
      // const noise = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
      // const noiseData = new Uint8Array(src.rows * src.cols);
      // for (let i = 0; i < noiseData.length; i++) {
      //   noiseData[i] = Math.random() * 255; // Random values between 0 and 255
      // }
      // noise.data.set(noiseData); // Copy random data to Mat
      // cv.threshold(noise, noise, 250, 255, cv.THRESH_BINARY);
      // cv.bitwise_or(src, noise, src);
      // noise.delete();



      // Step 7: Render to canvas
      cv.imshow(canvas, src);
      src.delete();
    } else if (filter.type === 'comic') {
      let dst = new cv.Mat();
      let gray = new cv.Mat();

      // Step 0: Downscale input to lower pixel resolution
      const pixelScaleFactor = 0.6; // 50% resolution (adjust to lower pixels)
      if (src.cols > 800 || src.rows > 800) {
        const lowResSize = new cv.Size(Math.round(src.cols * pixelScaleFactor), Math.round(src.rows * pixelScaleFactor));
        cv.resize(src, src, lowResSize, 0, 0, cv.INTER_AREA); // Downscale src
      }

      // Step 1: Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Step 2: Smooth/Sharp adjustment
      const smoothSharpValue = params.smoothSharp / 100; // 0 (smooth) to 1 (sharp)
      if (smoothSharpValue < 0.5) {
        // Smooth: Gaussian blur
        const kernelSize = Math.round(5 + 10 * (0.5 - smoothSharpValue)); // 5 to 15
        const ksize = new cv.Size(kernelSize | 1, kernelSize | 1); // Ensure odd
        cv.GaussianBlur(gray, dst, ksize, 0, 0);
        gray.delete();
        gray = dst;
        dst = new cv.Mat();
      } else {
        // Sharp: Unsharp masking
        const blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0);
        cv.addWeighted(gray, 1.5 + smoothSharpValue, blurred, -0.5 - smoothSharpValue, 0, dst);
        blurred.delete();
        gray.delete();
        gray = dst;
        dst = new cv.Mat();
      }

      // Step 3: Light/Dark adjustment
      const lightDarkValue = params.lightDark / 100; // 0 (light) to 1 (dark)
      const alpha = 1.0 + lightDarkValue; // 1.0 to 2.0 (contrast)
      const beta = lightDarkValue > 0.5 ? -50 * (lightDarkValue - 0.5) : 50 * (0.5 - lightDarkValue); // -25 to 25 (brightness)
      cv.convertScaleAbs(gray, dst, alpha, beta);
      gray.delete();
      gray = dst;
      dst = new cv.Mat();

      // Step 4: Halftoning with ordered dithering
      const scaleFactor = 0.5; // Downscale to 50% to reduce dot density
      const smallSize = new cv.Size(Math.round(gray.cols * scaleFactor), Math.round(gray.rows * scaleFactor));
      const smallGray = new cv.Mat();
      cv.resize(gray, smallGray, smallSize, 0, 0, cv.INTER_AREA); // Downscale gray

      const dots = new cv.Mat(smallGray.rows, smallGray.cols, cv.CV_8UC1, new cv.Scalar(255));
      // 4x4 clustered dot matrix, normalized to 0-255
      const bayer = new Float32Array([
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5
      ].map(x => (x / 16) * 255));
      for (let y = 0; y < smallGray.rows; y++) {
        for (let x = 0; x < smallGray.cols; x++) {
          const threshold = bayer[(y % 4) * 4 + (x % 4)];
          dots.data[y * dots.cols + x] = smallGray.data[y * smallGray.cols + x] > threshold ? 255 : 0;
        }
      }

      // Enlarge black dots with dilation, controlled by Thick/Thin
      const dotKernelSize = Math.round(1 + 2 * (params.thickThin / 100)); // 1 to 3
      const dotKernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(dotKernelSize, dotKernelSize)
      );
      cv.dilate(dots, dots, dotKernel); // Enlarge black dots (0 values)
      dotKernel.delete();

      // Upscale dots back to original size
      const fullSize = new cv.Size(gray.cols, gray.rows);
      cv.resize(dots, dots, fullSize, 0, 0, cv.INTER_NEAREST); // Keep binary look

      smallGray.delete();

      // Step 5: Use halftone dots directly (no edges)
      dst = dots; // Pass dots to output

      // Step 6: Convert to RGBA for display
      cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA);

      // Clean up
      gray.delete();
      src.delete();

      // Step 9: Display result
      cv.imshow(canvas, dst);
      dst.delete();
    }

  }, [image, filter, isOpenCvReady, params.smoothSharp, params.denseSparse, params.lightDark, params.thickThin]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // 检查canvas是否已存在

    const maxWidth = window.innerWidth * 0.5; // 50% of viewport width
    const maxHeight = window.innerHeight * 0.5; // 50% of viewport height

    const aspectRatio = image.width / image.height; // 获取图片的宽高比

    let newWidth = maxWidth;
    let newHeight = newWidth / aspectRatio;

    // 检查新计算的高度是否超出了最大允许高度
    if (newHeight > maxHeight) {
      newHeight = maxHeight;
      newWidth = newHeight * aspectRatio;
    }
    // 设置Canvas的实际尺寸
    canvas.width = newWidth;
    canvas.height = newHeight;

    // 设置Canvas的显示尺寸
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
  }, []); // 依赖数组中包含`image`，意味着每次`image`变化都会重新执行这个Effect


  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} className="border shadow-lg mb-4 " />
      {!isOpenCvReady && <p className="text-red-500 mb-4">Loading OpenCV.js...</p>}
      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => setFilter({ ...filter, type: 'none' })}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Original
        </button>
        <button
          onClick={() => setFilter({ ...filter, type: 'grayscale' })}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Grayscale
        </button>
        <button
          onClick={() => setFilter({ ...filter, type: 'etching' })}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={!isOpenCvReady}
        >
          Etching
        </button>
        <button
          onClick={() => {
            setParams({
              smoothSharp: 39,
              lightDark: 50,
              thickThin: 61,
              denseSparse: 50,
            })
            setFilter({ ...filter, type: 'stamp' })
          }
          }
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={!isOpenCvReady}
        >
          Stamp
        </button>
        <button
          onClick={() => {
            setParams({
              smoothSharp: 39,
              lightDark: 21,
              thickThin: 21,
              denseSparse: 61
            })
            setFilter({ ...filter, type: 'comic' })
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={!isOpenCvReady}
        >
          Comic
        </button>

      </div>

      {filter.type === 'etching' && isOpenCvReady && (
        <div className="flex flex-col items-center">
          <label className="mb-2">Threshold: {filter.threshold}</label>
          <input
            type="range"
            min="-50"
            max="100"
            value={filter.threshold}
            onChange={(e) => setFilter({ ...filter, threshold: Number(e.target.value) })}
            className="w-64"
          />
        </div>
      )}

      {(filter.type === 'stamp' || filter.type === 'comic') && isOpenCvReady && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md">
          <div>
            <label className="block mb-2">Smooth/Sharp: {params.smoothSharp}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.smoothSharp}
              onChange={(e) =>
                setParams({ ...params, smoothSharp: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="block mb-2">Light/Dark: {params.lightDark}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.lightDark}
              onChange={(e) =>
                setParams({ ...params, lightDark: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="block mb-2">Thick/Thin: {params.thickThin}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.thickThin}
              onChange={(e) =>
                setParams({ ...params, thickThin: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="block mb-2">Dense/Sparse: {params.denseSparse}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={params.denseSparse}
              onChange={(e) =>
                setParams({ ...params, denseSparse: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageProcessor;
