import { describe, expect, it } from "vitest";
import { fetchXmlToOData } from "./fetchxmlToOData";

describe("fetchXmlToOData", () => {
  it("translates attributes, a filter, order and count", () => {
    const xml = `
      <fetch count="50">
        <entity name="account">
          <attribute name="name" />
          <attribute name="accountnumber" />
          <order attribute="name" descending="true" />
          <filter type="and">
            <condition attribute="statecode" operator="eq" value="0" />
            <condition attribute="name" operator="like" value="%Contoso%" />
          </filter>
        </entity>
      </fetch>`;
    const q = fetchXmlToOData(xml);
    expect(q.entity).toBe("account");
    expect(q.select).toEqual(["name", "accountnumber"]);
    expect(q.top).toBe(50);
    expect(q.orderBy).toEqual(["name desc"]);
    expect(q.filter).toBe("statecode eq 0 and contains(name,'Contoso')");
  });

  it("handles null / not-null and or-joins", () => {
    const xml = `<fetch><entity name="contact"><attribute name="fullname"/>
      <filter type="or">
        <condition attribute="emailaddress1" operator="not-null" />
        <condition attribute="telephone1" operator="null" />
      </filter></entity></fetch>`;
    const q = fetchXmlToOData(xml);
    expect(q.filter).toBe("emailaddress1 ne null or telephone1 eq null");
  });

  it("quotes string values and leaves numbers unquoted", () => {
    const xml = `<fetch><entity name="account"><attribute name="name"/>
      <filter><condition attribute="name" operator="eq" value="O'Brien"/><condition attribute="revenue" operator="ge" value="1000"/></filter></entity></fetch>`;
    const q = fetchXmlToOData(xml);
    expect(q.filter).toBe("name eq 'O''Brien' and revenue ge 1000");
  });
});
