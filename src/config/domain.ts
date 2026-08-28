import raw from "../../domain.config.json";

export type DomainConfig = typeof raw;
export const domain = raw;

/** 자료의 지식 범위. 프롬프트와 소개 화면이 같은 문장을 쓰도록 한곳에서 읽는다. */
export const scopeSentence = `${domain.intro.scope} ${domain.intro.outOfScope}`;
