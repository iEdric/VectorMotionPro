
import { GoogleGenAI, Type } from "@google/genai";
import { SvgAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeSvg = async (svgCode: string): Promise<SvgAnalysis> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this SVG code and provide metadata for conversion to video/GIF. 
      Focus on finding animation duration and dimensions.
      
      SVG Code:
      ${svgCode.substring(0, 5000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasSmil: { type: Type.BOOLEAN },
            hasCssAnimation: { type: Type.BOOLEAN },
            viewBox: { type: Type.STRING },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            suggestedDuration: { type: Type.NUMBER, description: "Seconds" }
          },
          required: ["hasSmil", "hasCssAnimation", "width", "height", "suggestedDuration"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return {
      hasSmil: result.hasSmil || false,
      hasCssAnimation: result.hasCssAnimation || false,
      viewBox: result.viewBox || null,
      width: result.width || 500,
      height: result.height || 500,
      suggestedDuration: result.suggestedDuration || 5
    };
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      hasSmil: false,
      hasCssAnimation: false,
      viewBox: null,
      width: 500,
      height: 500,
      suggestedDuration: 5
    };
  }
};
