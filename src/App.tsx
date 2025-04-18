import { useState } from 'react';
import ImageProcessor from './components/ImageProcessor';

const App: React.FC = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 1048576) {
        alert("Please select an image smaller than 1MB.");
        event.target.value = '';
        return;
      }


      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => setImage(img);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Image to Stamp Simulator</h1>
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="mb-4 p-2 border rounded"
      />
      {image && <ImageProcessor image={image} />}
    </div>
  );
};

export default App;
