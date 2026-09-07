import {beforeEach,describe,expect,it,vi} from "vitest"; import request from "supertest";
vi.mock("../../src/services/auth.service.js",()=>({getUserFromAccessToken:vi.fn()}));
vi.mock("../../src/services/messaging.service.js",()=>{class MessagingServiceError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}return{MessagingServiceError,unreadMessageCount:vi.fn(),listConversations:vi.fn(),startConversation:vi.fn(),getConversation:vi.fn(),sendMessage:vi.fn(),markConversationRead:vi.fn(),listNotifications:vi.fn(),markNotificationRead:vi.fn(),markAllNotificationsRead:vi.fn()};});
import app from "../../src/app.js"; import {getUserFromAccessToken} from "../../src/services/auth.service.js"; import * as service from "../../src/services/messaging.service.js";
const USER="123e4567-e89b-42d3-a456-426614174000", PRODUCT="223e4567-e89b-42d3-a456-426614174000", CONVERSATION="323e4567-e89b-42d3-a456-426614174000", NOTIFICATION="423e4567-e89b-42d3-a456-426614174000";
const auth=()=>getUserFromAccessToken.mockResolvedValue({user:{id:USER},error:null});
describe("messaging API",()=>{beforeEach(()=>vi.clearAllMocks());
it("requires authentication",async()=>expect((await request(app).get("/api/v1/conversations")).status).toBe(401));
it("starts a product conversation",async()=>{auth();service.startConversation.mockResolvedValue({id:CONVERSATION});const r=await request(app).post("/api/v1/conversations").set("Authorization","Bearer token").send({productId:PRODUCT});expect(r.status).toBe(201);expect(service.startConversation).toHaveBeenCalledWith(USER,PRODUCT);});
it("sends a message",async()=>{auth();service.sendMessage.mockResolvedValue({id:"message-1",body:"Is this available?"});const r=await request(app).post(`/api/v1/conversations/${CONVERSATION}/messages`).set("Authorization","Bearer token").send({body:"Is this available?"});expect(r.status).toBe(201);});
it("marks incoming messages read",async()=>{auth();const r=await request(app).patch(`/api/v1/conversations/${CONVERSATION}/read`).set("Authorization","Bearer token");expect(r.status).toBe(204);expect(service.markConversationRead).toHaveBeenCalledWith(CONVERSATION,USER);});
it("lists unread notifications",async()=>{auth();service.listNotifications.mockResolvedValue({notifications:[{id:NOTIFICATION}],total:1});const r=await request(app).get("/api/v1/notifications?unread=true").set("Authorization","Bearer token");expect(r.status).toBe(200);expect(r.body.meta.total).toBe(1);});
it("marks all notifications read",async()=>{auth();const r=await request(app).patch("/api/v1/notifications/read-all").set("Authorization","Bearer token");expect(r.status).toBe(204);});
});

describe("unread message counts and scoped receipts", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires authentication for unread counts", async () => {
    expect((await request(app).get("/api/v1/conversations/unread-count")).status).toBe(401);
    expect(service.unreadMessageCount).not.toHaveBeenCalled();
  });
  it("counts messages for the authenticated participant", async () => {
    auth(); service.unreadMessageCount.mockResolvedValue({ count: 7 });
    const response = await request(app).get("/api/v1/conversations/unread-count").set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(7);
    expect(service.unreadMessageCount).toHaveBeenCalledWith(USER);
  });
  it("passes only displayed message IDs to the read operation", async () => {
    auth();
    const response = await request(app).patch(`/api/v1/conversations/${CONVERSATION}/read`).set("Authorization", "Bearer token").send({ messageIds: [NOTIFICATION] });
    expect(response.status).toBe(204);
    expect(service.markConversationRead).toHaveBeenCalledWith(CONVERSATION, USER, [NOTIFICATION]);
  });
  it.each([[], ["invalid"], "invalid", null])("rejects malformed receipt IDs: %j", async (messageIds) => {
    auth();
    const response = await request(app).patch(`/api/v1/conversations/${CONVERSATION}/read`).set("Authorization", "Bearer token").send({ messageIds });
    expect(response.status).toBe(400);
    expect(service.markConversationRead).not.toHaveBeenCalled();
  });
});
