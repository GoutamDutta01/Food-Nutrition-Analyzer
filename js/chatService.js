/**
 * NutriScan Text-Based AI Companion Client Service
 * Calls secure backend /api/chat endpoint without exposing any API keys to frontend
 */
export async function sendChatMessage(message, context) {
  if (!navigator.onLine) {
    throw new Error("Please check your internet connection and try again.");
  }

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        context: {
          userProfile: context.userProfile,
          dailyNutrition: context.dailyNutrition,
          recentMeals: context.recentMeals?.slice(-10),
          selectedFood: context.selectedFood,
          nutritionGoals: {
            calories: context.userProfile?.calorieTarget,
            protein: context.userProfile?.proteinTarget,
            carbs: context.userProfile?.carbTarget,
            fats: context.userProfile?.fatTarget,
            fiber: context.userProfile?.fiberTarget
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    return data.reply || "NutriScan AI is temporarily unavailable. Please try again.";
  } catch (error) {
    console.error('[Chat Service Error]:', error);
    if (!navigator.onLine) {
      throw new Error("Please check your internet connection and try again.");
    }
    throw new Error("NutriScan AI is temporarily unavailable. Please try again.");
  }
}
