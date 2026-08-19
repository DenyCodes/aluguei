import type { Property } from "../lib/types";

const imageModules = import.meta.glob(
  "../imagens/{casa1,casa3,casa4,casa5}/*.jpg",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const getImages = (folder: string) =>
  Object.entries(imageModules)
    .filter(([path]) => path.includes(`/imagens/${folder}/`))
    .sort(([a], [b]) =>
      a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
    )
    .map(([, image]) => image);

export const seedProperties: Property[] = [
  {
    id: "seed-casa-1",
    title: "Casa com área de serviço",
    neighborhood: "sepetiba",
    neighborhood_label: "Sepetiba",
    address: "Avenida Santa Ursulina",
    price: 500,
    bedrooms: 1,
    bathrooms: 1,
    area: 120,
    water_policy: "individual",
    electricity_policy: "individual",
    contact: "(21) 99345-0137",
    active: true,
    availability_status: "available",
    images: getImages("casa5"),
  },
  {
    id: "seed-casa-2",
    title: "Casa com cômodo extra",
    neighborhood: "sepetiba",
    neighborhood_label: "Sepetiba",
    address: "Avenida Santa Ursulina, 500",
    price: 650,
    bedrooms: 2,
    bathrooms: 1,
    area: 250,
    water_policy: "shared",
    electricity_policy: "individual",
    contact: "(21) 99345-0137",
    active: true,
    availability_status: "available",
    images: getImages("casa1"),
  },
  {
    id: "seed-casa-3",
    title: "Casa econômica com varanda",
    neighborhood: "vila-nova",
    neighborhood_label: "Vila Nova",
    address: "Rua 10, 88",
    price: 500,
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    water_policy: "individual",
    electricity_policy: "individual",
    contact: "(21) 99345-0137",
    active: true,
    availability_status: "available",
    images: getImages("casa4"),
  },
  {
    id: "seed-casa-4",
    title: "Casa com varanda em vila residencial",
    neighborhood: "sepetiba",
    neighborhood_label: "Sepetiba",
    address: "Avenida Santa Ursulina, 340A, casa 3",
    price: 500,
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    water_policy: "included",
    electricity_policy: "included",
    contact: "(21) 99345-0137",
    active: true,
    availability_status: "available",
    images: getImages("casa3"),
  },
];
