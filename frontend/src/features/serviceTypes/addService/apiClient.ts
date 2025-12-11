import type { Service } from "@/types";
import { createService, updateService } from "@/lib/api";

export interface AddServiceApiClient {
  create(payload: Partial<Service>): Promise<Service>;
  update(id: number, payload: Partial<Service>): Promise<Service>;
}

export const addServiceApiClient: AddServiceApiClient = {
  async create(payload) {
    const res = await createService(payload);
    return res.data;
  },

  async update(id, payload) {
    const res = await updateService(id, payload);
    return res.data;
  },
};

