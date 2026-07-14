import mongoose from "mongoose";

export async function connectMongo(url: string): Promise<void> {
  await mongoose.connect(url);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
